"""Tests for the orchestrator state machine."""

import pytest
from app.orchestrator.state_machine import StateMachine
from app.core.exceptions import InvalidStateTransition, GateNotApproved


@pytest.fixture
def sm():
    return StateMachine()


class TestValidTransitions:
    def test_briefing_to_discovery(self, sm):
        assert sm.can_transition("briefing", "discovery") is True

    def test_discovery_to_prd_creation(self, sm):
        assert sm.can_transition("discovery", "prd_creation") is True

    def test_prd_review_to_architecture(self, sm):
        assert sm.can_transition("prd_review", "architecture") is True

    def test_development_to_code_review(self, sm):
        assert sm.can_transition("development", "code_review") is True

    def test_qa_to_uat(self, sm):
        assert sm.can_transition("qa_testing", "uat") is True

    def test_deployment_to_complete(self, sm):
        assert sm.can_transition("deployment", "complete") is True


class TestInvalidTransitions:
    def test_briefing_to_development(self, sm):
        assert sm.can_transition("briefing", "development") is False

    def test_discovery_to_architecture(self, sm):
        assert sm.can_transition("discovery", "architecture") is False

    def test_complete_to_anything(self, sm):
        assert sm.can_transition("complete", "briefing") is False


class TestRollbackTransitions:
    def test_prd_review_rejection(self, sm):
        assert sm.can_transition("prd_review", "prd_creation") is True

    def test_code_review_rejection(self, sm):
        assert sm.can_transition("code_review", "development") is True

    def test_qa_failure_to_development(self, sm):
        assert sm.can_transition("qa_testing", "development") is True

    def test_qa_critical_failure_to_sprint_planning(self, sm):
        assert sm.can_transition("qa_testing", "sprint_planning") is True

    def test_uat_rejection_to_sprint_planning(self, sm):
        assert sm.can_transition("uat", "sprint_planning") is True


class TestGateRequirements:
    def test_prd_gate(self, sm):
        assert sm.requires_gate("prd_review", "architecture") == "gate_1_prd"

    def test_budget_gate(self, sm):
        assert sm.requires_gate("budget_review", "sprint_planning") == "gate_2_arch_budget"

    def test_uat_gate(self, sm):
        assert sm.requires_gate("uat", "deployment") == "gate_3_uat"

    def test_release_gate(self, sm):
        assert sm.requires_gate("deployment", "complete") == "gate_4_release"

    def test_no_gate_required(self, sm):
        assert sm.requires_gate("development", "code_review") is None


class TestValidateTransition:
    def test_valid_no_gate(self, sm):
        sm.validate_transition("briefing", "discovery")  # Should not raise

    def test_invalid_raises(self, sm):
        with pytest.raises(InvalidStateTransition):
            sm.validate_transition("briefing", "development")

    def test_gate_not_approved_raises(self, sm):
        with pytest.raises(GateNotApproved):
            sm.validate_transition("prd_review", "architecture", gate_approved=False)

    def test_gate_approved_passes(self, sm):
        sm.validate_transition("prd_review", "architecture", gate_approved=True)


class TestHelpers:
    def test_active_agents_development(self, sm):
        agents = sm.get_active_agents("development")
        assert "backend_dev" in agents
        assert "frontend_dev" in agents

    def test_active_agents_discovery(self, sm):
        assert sm.get_active_agents("discovery") == ["cpo"]

    def test_is_review_state(self, sm):
        assert sm.is_review_state("prd_review") is True
        assert sm.is_review_state("development") is False

    def test_is_terminal(self, sm):
        assert sm.is_terminal("complete") is True
        assert sm.is_terminal("failed") is True
        assert sm.is_terminal("development") is False
