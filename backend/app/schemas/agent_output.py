from typing import Literal

from pydantic import BaseModel


# --- CPO Outputs ---

class UserStory(BaseModel):
    title: str
    as_a: str
    i_want: str
    so_that: str
    acceptance_criteria: list[str]
    priority: Literal["must-have", "should-have", "nice-to-have"]


class Feature(BaseModel):
    name: str
    description: str
    priority: Literal["must-have", "should-have", "nice-to-have"]
    user_stories: list[str]  # references to user story titles
    estimated_complexity: Literal["low", "medium", "high"]


class CPODiscoveryOutput(BaseModel):
    clarifying_questions: list[str]
    initial_user_personas: list[dict]
    competitive_analysis: str
    recommended_success_metrics: list[str]


class CPOPRDOutput(BaseModel):
    product_vision: str
    goals: list[str]
    user_stories: list[UserStory]
    features: list[Feature]
    non_functional_requirements: list[str]
    success_metrics: list[str]
    ui_ux_notes: str = ""


# --- Designer Outputs ---

class DesignComponent(BaseModel):
    name: str
    description: str
    states: list[str] = ["default", "hover", "active", "disabled"]

class DesignerOutput(BaseModel):
    design_system: dict[str, str]  # e.g. "primary_color": "#FF0000"
    typography: dict[str, str]
    components: list[DesignComponent]
    wireframes: list[dict]  # {"page": "Home", "layout": "Header -> Hero -> Footer"}
    accessibility_notes: str = ""

# --- CTO Outputs ---

class APIEndpoint(BaseModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"]
    path: str
    description: str
    request_body: dict | None = None
    response_body: dict | None = None


class TechnicalRisk(BaseModel):
    risk: str
    severity: Literal["high", "medium", "low"]
    mitigation: str


class CTOArchitectureOutput(BaseModel):
    tech_stack: dict[str, str]
    system_design: str
    database_schema: str
    api_design: list[APIEndpoint]
    security_approach: str
    deployment_plan: str
    technical_risks: list[TechnicalRisk]
    scalability_notes: str = ""


class EpicBreakdown(BaseModel):
    title: str
    description: str
    features: list["FeatureBreakdown"]


class FeatureBreakdown(BaseModel):
    title: str
    description: str
    assigned_to: Literal["backend_dev", "frontend_dev"]
    stories: list["StoryBreakdown"]
    dependencies: list[str] = []


class StoryBreakdown(BaseModel):
    title: str
    description: str
    acceptance_criteria: list[str]
    subtasks: list[str]
    estimated_hours: float


class CTOTaskBreakdownOutput(BaseModel):
    epics: list[EpicBreakdown]
    sprint_plan: list[dict] = []  # sprint number -> task titles


class CodeReviewComment(BaseModel):
    file: str
    line: int
    comment: str
    severity: Literal["critical", "high", "medium", "low"]


class CodeReviewOutput(BaseModel):
    approved: bool
    comments: list[CodeReviewComment]
    summary: str
    required_changes: list[str]


# --- CFO Outputs ---

class CFOBudgetOutput(BaseModel):
    total_estimate_cents: int
    breakdown: dict[str, int]  # category -> cents
    assumptions: list[str]
    risks: list[str]
    recommendations: list[str]
    monthly_runway: str = ""


# --- Developer Outputs ---

class FileWrite(BaseModel):
    path: str
    content: str
    operation: Literal["create", "modify"] = "create"


class DevCodeOutput(BaseModel):
    files: list[FileWrite]
    tests: list[FileWrite]
    summary: str
    blockers: list[str] = []
    next_steps: list[str] = []


# --- QA Outputs ---

class BugReport(BaseModel):
    title: str
    severity: Literal["critical", "high", "medium", "low"]
    description: str
    steps_to_reproduce: str
    expected_behavior: str
    actual_behavior: str


class QATestOutput(BaseModel):
    tests_run: int
    tests_passed: int
    tests_failed: int
    bugs_found: list[BugReport]
    recommendation: Literal["pass", "fail", "pass_with_notes"]
    notes: str = ""


class TestPlanOutput(BaseModel):
    test_cases: list[dict]  # {"name": str, "type": str, "steps": list[str], "expected": str}
    coverage_areas: list[str]


# --- Meeting Outputs ---

class MeetingSpeakerTurn(BaseModel):
    speaker: str
    topic: str
    position: str
    concerns: list[str] = []
    questions_for: dict[str, str] = {}
    decision_proposed: str | None = None


class MeetingDecision(BaseModel):
    decision: str
    decision_status: Literal["approved", "needs_more_discussion", "escalate_to_ceo"]
    action_items: list[dict] = []  # {"owner": str, "task": str}
    dissents: list[str] = []
