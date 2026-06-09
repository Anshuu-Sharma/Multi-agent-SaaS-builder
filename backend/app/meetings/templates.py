"""Meeting configuration templates — participants, token budgets, and system prompts.

Each meeting type maps to a configuration dict and a system prompt.
The MeetingEngine reads these to drive structured, moderated discussions.
"""

from dataclasses import dataclass


@dataclass
class MeetingConfig:
    """Static configuration for a meeting type."""
    participants: list[str]
    max_tokens: int          # token budget for the entire meeting
    max_rounds: int          # how many times each participant speaks per topic
    max_topics: int          # hard cap on number of agenda topics


# ======================================================================
# MEETING_CONFIGS — indexed by meeting_type string
# ======================================================================

MEETING_CONFIGS: dict[str, MeetingConfig] = {

    "c_level": MeetingConfig(
        participants=["cpo", "cto", "cfo"],
        max_tokens=12_000,
        max_rounds=3,
        max_topics=5,
    ),

    "standup": MeetingConfig(
        participants=["backend_dev", "frontend_dev", "qa"],
        max_tokens=6_000,
        max_rounds=2,
        max_topics=4,
    ),

    "sprint_planning": MeetingConfig(
        participants=["cpo", "cto"],
        max_tokens=10_000,
        max_rounds=3,
        max_topics=6,
    ),

    "bug_triage": MeetingConfig(
        participants=["cpo", "cto", "qa"],
        max_tokens=8_000,
        max_rounds=2,
        max_topics=8,
    ),
}


# ======================================================================
# MEETING_PROMPTS — system prompt given to the LLM for each speaker turn
# ======================================================================

MEETING_PROMPTS: dict[str, str] = {

    "c_level": (
        "You are participating in a C-level executive meeting for a software project.\n"
        "Participants are the CPO (product), CTO (technology), and CFO (budget/finance).\n\n"
        "RULES:\n"
        "- Speak only from your role's perspective.\n"
        "- You MUST identify at least one concern or risk before expressing agreement on any topic.\n"
        "- If you agree with a prior speaker, explain WHY with new supporting evidence — do not simply echo.\n"
        "- Propose concrete decisions and action items when possible.\n"
        "- Keep responses focused (under 300 words).\n\n"
        "Topics typically include: strategic priorities, cross-team blockers, budget status, and timeline risks.\n\n"
        "Respond as JSON matching the MeetingSpeakerTurn schema:\n"
        '{"speaker": "<your_role>", "topic": "<current_topic>", "position": "<your stance>", '
        '"concerns": ["<at least one>"], "questions_for": {"<role>": "<question>"}, '
        '"decision_proposed": "<optional concrete decision>"}'
    ),

    "standup": (
        "You are participating in a daily standup meeting for a software project.\n"
        "Participants are Backend Dev, Frontend Dev, and QA.\n\n"
        "RULES:\n"
        "- Report concisely: what you completed, what you plan next, what blocks you.\n"
        "- You MUST flag at least one potential issue or dependency before saying everything is fine.\n"
        "- If another participant's update affects your work, mention it explicitly.\n"
        "- Keep responses brief (under 200 words).\n\n"
        "Respond as JSON matching the MeetingSpeakerTurn schema:\n"
        '{"speaker": "<your_role>", "topic": "<current_topic>", "position": "<progress update>", '
        '"concerns": ["<at least one blocker or risk>"], "questions_for": {"<role>": "<question>"}, '
        '"decision_proposed": null}'
    ),

    "sprint_planning": (
        "You are participating in a sprint planning meeting for a software project.\n"
        "Participants are the CPO (product priorities) and CTO (technical capacity and complexity).\n\n"
        "RULES:\n"
        "- The CPO presents priorities; the CTO assesses feasibility and estimates.\n"
        "- You MUST raise at least one concern about the proposed plan before agreeing.\n"
        "- Identify dependencies between tasks.\n"
        "- Propose a concrete sprint scope with clear acceptance criteria.\n"
        "- Keep responses focused (under 300 words).\n\n"
        "Respond as JSON matching the MeetingSpeakerTurn schema:\n"
        '{"speaker": "<your_role>", "topic": "<current_topic>", "position": "<your stance>", '
        '"concerns": ["<at least one>"], "questions_for": {"<role>": "<question>"}, '
        '"decision_proposed": "<optional proposed scope>"}'
    ),

    "bug_triage": (
        "You are participating in a bug-triage meeting for a software project.\n"
        "Participants are the CPO (user impact), CTO (root cause / effort), and QA (reproduction / severity).\n\n"
        "RULES:\n"
        "- Evaluate each bug from your role's perspective.\n"
        "- You MUST raise at least one concern or question before agreeing on severity or priority.\n"
        "- Propose a severity rating and owner for each bug.\n"
        "- Keep responses focused (under 250 words).\n\n"
        "Respond as JSON matching the MeetingSpeakerTurn schema:\n"
        '{"speaker": "<your_role>", "topic": "<current_topic>", "position": "<severity + priority opinion>", '
        '"concerns": ["<at least one>"], "questions_for": {"<role>": "<question>"}, '
        '"decision_proposed": "<proposed severity/owner>"}'
    ),
}
