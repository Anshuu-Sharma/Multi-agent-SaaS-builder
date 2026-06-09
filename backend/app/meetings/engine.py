"""Meeting engine — runs structured, moderated multi-agent meetings.

Implements round-robin discussions where agents speak in a fixed order,
anti-sycophancy rules are enforced, and decisions/action items are extracted
after each topic.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import Event, EventType
from app.core.redis import redis_client
from app.llm.base import BaseLLMProvider, LLMConfig, LLMResponse
from app.meetings.templates import MEETING_CONFIGS, MEETING_PROMPTS, MeetingConfig
from app.models.meeting import Meeting
from app.models.project import Project
from app.schemas.agent_output import MeetingDecision, MeetingSpeakerTurn
from app.schemas.meeting import MeetingRead
from app.services.cost_tracker import CostTracker

logger = logging.getLogger(__name__)

# LLM config used for individual speaker turns
_TURN_LLM_CONFIG = LLMConfig(
    temperature=0.4,
    max_output_tokens=2048,
    response_format="json",
)

# LLM config for the extraction / decision call
_EXTRACTION_LLM_CONFIG = LLMConfig(
    temperature=0.1,
    max_output_tokens=1024,
    response_format="json",
)

_EXTRACTION_PROMPT = (
    "You are a meeting secretary. Given the discussion transcript for a single "
    "agenda topic, extract:\n"
    "1. The decision reached (or 'needs_more_discussion' / 'escalate_to_ceo').\n"
    "2. Action items with owner and task description.\n"
    "3. Any recorded dissents.\n\n"
    "Respond ONLY with JSON matching this schema:\n"
    '{"decision": "...", "decision_status": "approved|needs_more_discussion|escalate_to_ceo", '
    '"action_items": [{"owner": "...", "task": "..."}], "dissents": ["..."]}'
)


class MeetingEngine:
    """Runs a structured meeting between a set of MET agents."""

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    @staticmethod
    async def run_meeting(
        db: AsyncSession,
        project_id: uuid.UUID,
        meeting_type: str,
        agenda_topics: list[str],
        llm_provider: BaseLLMProvider,
    ) -> MeetingRead:
        """Execute a full meeting and persist the results.

        1. Validate meeting type and build configuration.
        2. For each agenda topic (up to ``max_topics``):
           a. Run ``max_rounds`` of round-robin speaker turns.
           b. Extract decisions and action items from the topic transcript.
        3. Persist ``Meeting`` row and return ``MeetingRead``.
        """
        config = _get_config(meeting_type)
        system_prompt = MEETING_PROMPTS.get(meeting_type, MEETING_PROMPTS["standup"])

        # Cap topics to the configured maximum
        topics = agenda_topics[: config.max_topics]

        # Load project context once
        project = await _get_project(db, project_id)
        project_ctx = (
            f"[PROJECT] {project.name}\n"
            f"Brief: {project.brief}\n"
            f"State: {project.state}"
        )

        started_at = datetime.now(timezone.utc)
        total_tokens = 0
        total_cost_cents = 0
        full_transcript: list[dict] = []
        all_decisions: list[dict] = []
        all_action_items: list[dict] = []

        # Publish meeting-started event
        await redis_client.publish_event(Event(
            type=EventType.MEETING_STARTED,
            project_id=project_id,
            source="meeting_engine",
            payload={"meeting_type": meeting_type, "topics": topics},
        ))

        # ---- Iterate over topics ------------------------------------
        for topic_idx, topic in enumerate(topics):
            topic_transcript: list[dict] = []
            topic_budget_exhausted = False

            for round_num in range(1, config.max_rounds + 1):
                for participant in config.participants:
                    if topic_budget_exhausted:
                        break

                    turn_response = await _generate_turn(
                        llm=llm_provider,
                        system_prompt=system_prompt,
                        project_context=project_ctx,
                        topic=topic,
                        participant=participant,
                        round_num=round_num,
                        prior_turns=topic_transcript,
                    )

                    # Track cost
                    await CostTracker.record_cost(
                        db, project_id, participant, turn_response,
                    )
                    await CostTracker.check_thresholds(db, project_id)

                    total_tokens += turn_response.input_tokens + turn_response.output_tokens
                    total_cost_cents += turn_response.cost_cents

                    # Parse and validate turn
                    turn_data = _parse_turn(turn_response.content, participant, topic)
                    topic_transcript.append(turn_data)

                    # Anti-sycophancy enforcement: log a warning if no concerns
                    if not turn_data.get("concerns"):
                        logger.warning(
                            "Anti-sycophancy: %s raised no concerns for topic '%s' (round %d)",
                            participant, topic, round_num,
                        )

                    # Check token budget
                    if total_tokens >= config.max_tokens:
                        logger.info(
                            "Token budget exhausted (%d / %d) during topic '%s'",
                            total_tokens, config.max_tokens, topic,
                        )
                        topic_budget_exhausted = True
                        break

            # ---- Extract decisions for this topic --------------------
            extraction_response = await _extract_decisions(
                llm=llm_provider,
                topic=topic,
                transcript=topic_transcript,
            )
            total_tokens += extraction_response.input_tokens + extraction_response.output_tokens
            total_cost_cents += extraction_response.cost_cents

            decision_data = _parse_decision(extraction_response.content, topic)
            all_decisions.append(decision_data)
            all_action_items.extend(decision_data.get("action_items", []))

            # Append topic section to full transcript
            full_transcript.append({
                "topic": topic,
                "topic_index": topic_idx,
                "turns": topic_transcript,
                "decision": decision_data,
            })

            # If we've already blown the budget, stop processing topics
            if total_tokens >= config.max_tokens:
                logger.info("Token budget reached; stopping after topic '%s'", topic)
                break

        ended_at = datetime.now(timezone.utc)

        # ---- Persist meeting record ----------------------------------
        meeting = Meeting(
            project_id=project_id,
            meeting_type=meeting_type,
            participants=config.participants,
            agenda={"topics": topics},
            transcript=full_transcript,
            decisions=all_decisions,
            action_items=all_action_items,
            token_usage=total_tokens,
            cost_cents=total_cost_cents,
            started_at=started_at,
            ended_at=ended_at,
        )
        db.add(meeting)
        await db.flush()

        # Publish meeting-ended event
        await redis_client.publish_event(Event(
            type=EventType.MEETING_ENDED,
            project_id=project_id,
            source="meeting_engine",
            payload={
                "meeting_id": str(meeting.id),
                "meeting_type": meeting_type,
                "decisions_count": len(all_decisions),
                "action_items_count": len(all_action_items),
                "token_usage": total_tokens,
                "cost_cents": total_cost_cents,
            },
        ))

        logger.info(
            "Meeting %s (%s) for project %s completed: %d decisions, %d action items, %d tokens",
            meeting.id, meeting_type, project_id,
            len(all_decisions), len(all_action_items), total_tokens,
        )

        return MeetingRead(
            id=meeting.id,
            project_id=meeting.project_id,
            meeting_type=meeting.meeting_type,
            participants=meeting.participants,
            agenda=meeting.agenda,
            transcript=meeting.transcript,
            decisions=meeting.decisions,
            action_items=meeting.action_items,
            token_usage=meeting.token_usage,
            cost_cents=meeting.cost_cents,
            started_at=meeting.started_at,
            ended_at=meeting.ended_at,
        )


# ======================================================================
# Internal helpers
# ======================================================================

def _get_config(meeting_type: str) -> MeetingConfig:
    """Look up and return the meeting configuration, raising on unknown types."""
    config = MEETING_CONFIGS.get(meeting_type)
    if config is None:
        valid = ", ".join(sorted(MEETING_CONFIGS.keys()))
        raise ValueError(
            f"Unknown meeting type '{meeting_type}'. Valid types: {valid}"
        )
    return config


async def _get_project(db: AsyncSession, project_id: uuid.UUID) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    return result.scalar_one()


async def _generate_turn(
    llm: BaseLLMProvider,
    system_prompt: str,
    project_context: str,
    topic: str,
    participant: str,
    round_num: int,
    prior_turns: list[dict],
) -> LLMResponse:
    """Call the LLM for a single speaker turn."""
    messages: list[dict] = [
        {"role": "user", "content": project_context},
        {"role": "model", "content": "I have the project context."},
    ]

    # Inject prior turns for this topic so the speaker can reference them
    if prior_turns:
        history_text = "\n\n".join(
            f"[{t['speaker']}] (round {t.get('round', '?')}): {t.get('position', '')}\n"
            f"  Concerns: {t.get('concerns', [])}\n"
            f"  Decision proposed: {t.get('decision_proposed', 'none')}"
            for t in prior_turns
        )
        messages.append({
            "role": "user",
            "content": f"[PRIOR DISCUSSION ON THIS TOPIC]\n{history_text}",
        })
        messages.append({
            "role": "model",
            "content": "I've reviewed the prior discussion.",
        })

    messages.append({
        "role": "user",
        "content": (
            f"Topic: {topic}\n"
            f"You are: {participant} (round {round_num})\n\n"
            "Provide your input. Remember: you MUST raise at least one concern "
            "before expressing agreement. Respond with JSON only."
        ),
    })

    return await llm.generate(
        system_prompt=system_prompt,
        messages=messages,
        config=_TURN_LLM_CONFIG,
    )


def _parse_turn(raw: str, participant: str, topic: str) -> dict:
    """Parse an LLM response into a turn dict, falling back gracefully."""
    try:
        data = json.loads(raw)
        # Validate through Pydantic for safety
        turn = MeetingSpeakerTurn.model_validate(data)
        result = turn.model_dump()
    except (json.JSONDecodeError, Exception) as exc:
        logger.warning("Failed to parse turn from %s: %s", participant, exc)
        result = {
            "speaker": participant,
            "topic": topic,
            "position": raw[:1000],
            "concerns": [],
            "questions_for": {},
            "decision_proposed": None,
        }

    # Ensure the speaker field is set correctly (override LLM hallucinations)
    result["speaker"] = participant
    result["topic"] = topic
    return result


async def _extract_decisions(
    llm: BaseLLMProvider,
    topic: str,
    transcript: list[dict],
) -> LLMResponse:
    """Run an extraction call to pull decisions and action items from a topic."""
    transcript_text = "\n\n".join(
        f"[{t['speaker']}]: {t.get('position', '')}\n"
        f"  Concerns: {t.get('concerns', [])}\n"
        f"  Proposed: {t.get('decision_proposed', 'none')}"
        for t in transcript
    )

    messages = [
        {
            "role": "user",
            "content": (
                f"Topic: {topic}\n\n"
                f"Transcript:\n{transcript_text}\n\n"
                "Extract the decision, action items, and dissents."
            ),
        },
    ]

    return await llm.generate(
        system_prompt=_EXTRACTION_PROMPT,
        messages=messages,
        config=_EXTRACTION_LLM_CONFIG,
    )


def _parse_decision(raw: str, topic: str) -> dict:
    """Parse an extraction response into a decision dict."""
    try:
        data = json.loads(raw)
        decision = MeetingDecision.model_validate(data)
        result = decision.model_dump()
    except (json.JSONDecodeError, Exception) as exc:
        logger.warning("Failed to parse decision for topic '%s': %s", topic, exc)
        result = {
            "decision": f"Unable to extract decision for: {topic}",
            "decision_status": "needs_more_discussion",
            "action_items": [],
            "dissents": [],
        }

    result["topic"] = topic
    return result
