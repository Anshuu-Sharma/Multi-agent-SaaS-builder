"""Deterministic state machine for project lifecycle.

This is pure logic — no LLM calls. The state machine enforces valid transitions
and approval gates. All transitions are logged to the audit trail.
"""

from app.core.exceptions import GateNotApproved, InvalidStateTransition

# Valid state transitions. Key = current state, value = list of valid next states.
TRANSITIONS: dict[str, list[str]] = {
    "briefing": ["discovery"],
    "discovery": ["prd_creation"],
    "prd_creation": ["prd_review"],
    "prd_review": ["design", "prd_creation"],  # approve → design, reject → prd_creation
    "design": ["design_review"],
    "design_review": ["architecture", "design"],  # approve → architecture, reject → design
    "architecture": ["arch_review"],
    "arch_review": ["budget", "architecture"],  # approve → budget, reject → architecture
    "budget": ["budget_review"],
    "budget_review": ["sprint_planning", "budget"],  # approve → sprint_planning, reject → budget
    "sprint_planning": ["development"],
    "development": ["code_review"],
    "code_review": ["qa_testing", "development"],  # approve or reject
    "qa_testing": ["uat", "development", "sprint_planning"],  # pass, minor fail, major fail
    "uat": ["deployment", "sprint_planning"],  # accept or reject
    "deployment": ["complete"],
    "complete": [],
    "failed": [],
}

# Transitions that require approval gate to pass first.
# (from_state, to_state) → gate identifier
GATES: dict[tuple[str, str], str] = {
    ("prd_review", "design"): "gate_1_prd",
    ("design_review", "architecture"): "gate_1_design",
    ("arch_review", "budget"): "gate_1_arch",
    ("budget_review", "sprint_planning"): "gate_2_arch_budget",
    ("uat", "deployment"): "gate_3_uat",
    ("deployment", "complete"): "gate_4_release",
}

# Rollback transitions (non-approval, triggered by failure)
ROLLBACKS: dict[str, str] = {
    "prd_creation": "prd_review",      # PRD rejected, redo
    "design": "design_review",         # Design rejected, redo
    "architecture": "arch_review",      # Arch rejected, redo
    "development": "code_review",       # Code rejected, fix
    "sprint_planning": "qa_testing",    # QA critical fail, re-scope
}

# Which agents are active in each state
STATE_AGENTS: dict[str, list[str]] = {
    "briefing": [],  # CEO provides brief (human)
    "discovery": ["cpo"],
    "prd_creation": ["cpo"],
    "prd_review": [],  # CEO reviews (human)
    "design": ["designer"],
    "design_review": [],  # CEO reviews (human)
    "architecture": ["cto"],
    "arch_review": [],  # CEO reviews (human)
    "budget": ["cfo"],
    "budget_review": [],  # CEO reviews (human)
    "sprint_planning": ["cto", "cpo"],
    "development": ["backend_dev", "frontend_dev"],
    "code_review": ["cto"],
    "qa_testing": ["qa"],
    "uat": ["cpo"],  # CPO acceptance + CEO approval
    "deployment": [],  # CEO approves (human)
    "complete": [],
}


class StateMachine:
    """Manages project state transitions."""

    def can_transition(self, from_state: str, to_state: str) -> bool:
        # Any non-terminal state can transition to "failed" (budget stop, unrecoverable error)
        if to_state == "failed" and not self.is_terminal(from_state):
            return True
        # Allow retrying from failed state back to any valid state
        if from_state == "failed" and to_state != "failed":
            return True
        valid_targets = TRANSITIONS.get(from_state, [])
        return to_state in valid_targets

    def requires_gate(self, from_state: str, to_state: str) -> str | None:
        return GATES.get((from_state, to_state))

    def get_active_agents(self, state: str) -> list[str]:
        return STATE_AGENTS.get(state, [])

    def get_valid_transitions(self, state: str) -> list[str]:
        return TRANSITIONS.get(state, [])

    def validate_transition(
        self, from_state: str, to_state: str, gate_approved: bool = False
    ) -> None:
        """Validate a transition. Raises on invalid."""
        if not self.can_transition(from_state, to_state):
            raise InvalidStateTransition(from_state, to_state)

        gate = self.requires_gate(from_state, to_state)
        if gate and not gate_approved:
            raise GateNotApproved(gate)

    def is_review_state(self, state: str) -> bool:
        """States where human (CEO) needs to take action."""
        return state in {"prd_review", "design_review", "arch_review", "budget_review", "uat", "deployment"}

    def is_terminal(self, state: str) -> bool:
        return state in {"complete", "failed"}
