class METError(Exception):
    """Base exception for MET system."""
    pass


class AgentRetryExhausted(METError):
    """Agent failed after max retries."""
    def __init__(self, role: str, max_retries: int):
        self.role = role
        self.max_retries = max_retries
        super().__init__(f"Agent '{role}' failed after {max_retries} retries")


class InvalidStateTransition(METError):
    """Attempted invalid state transition."""
    def __init__(self, from_state: str, to_state: str):
        self.from_state = from_state
        self.to_state = to_state
        super().__init__(f"Cannot transition from '{from_state}' to '{to_state}'")


class GateNotApproved(METError):
    """State transition blocked by unapproved gate."""
    def __init__(self, gate_name: str):
        self.gate_name = gate_name
        super().__init__(f"Gate '{gate_name}' has not been approved")


class BudgetExceeded(METError):
    """Budget threshold exceeded."""
    def __init__(self, project_id: str, threshold: str):
        super().__init__(f"Project {project_id} exceeded {threshold} budget threshold")


class OutputValidationError(METError):
    """Agent output failed schema validation."""
    def __init__(self, role: str, errors: str):
        self.role = role
        self.errors = errors
        super().__init__(f"Agent '{role}' output validation failed: {errors}")


class WorkspaceSecurityError(METError):
    """File path outside allowed workspace."""
    def __init__(self, path: str):
        super().__init__(f"Path '{path}' is outside the allowed workspace")
