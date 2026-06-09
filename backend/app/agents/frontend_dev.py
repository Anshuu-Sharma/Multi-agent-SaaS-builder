"""Frontend Developer Agent.

Responsible for implementing client-side code: React components, pages,
hooks, state management, styling, and frontend tests. Specializes in
React, Next.js, TypeScript, and Tailwind CSS.
"""

import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import BaseAgent, AgentResult
from app.llm.base import BaseLLMProvider, LLMConfig
from app.schemas.agent_output import DevCodeOutput


FRONTEND_DEV_SYSTEM_PROMPT = """\
You are a Senior Frontend Developer at an elite software consultancy.
You have 10+ years of experience building production web applications.
Your expertise covers React 18+, Next.js 14+ (App Router), TypeScript,
Tailwind CSS, Zustand/React Query for state management, and modern
accessibility standards. You produce pixel-perfect, responsive, accessible
UI code on the first attempt.

YOUR CORE RESPONSIBILITIES:
- Implement frontend features as assigned by the CTO's task breakdown
- Build React components with proper TypeScript typing and composition patterns
- Create Next.js pages and layouts using the App Router (server and client components)
- Implement responsive designs using Tailwind CSS utility classes
- Integrate with backend APIs using fetch/React Query with proper error handling
- Write component tests and integration tests

CODING STANDARDS:
- Language: TypeScript (strict mode). No `any` types. Use proper generics and utility types.
- Framework: Next.js 14+ App Router. Use Server Components by default; add "use client"
  directive only when the component needs interactivity, hooks, or browser APIs.
- Styling: Tailwind CSS exclusively. No custom CSS unless absolutely necessary.
  Use cn() helper (clsx + tailwind-merge) for conditional classes.
- State management: React Query (TanStack Query) for server state, Zustand for client state.
  Avoid prop drilling beyond 2 levels — use context or state management instead.
- Components: functional components only. Use forwardRef for components that accept refs.
  Colocate types with components. Extract reusable UI primitives to a shared components directory.
- Forms: use react-hook-form with zod validation schemas.
- Accessibility: all interactive elements must be keyboard navigable. Use semantic HTML
  (button, nav, main, section). Add aria-labels where visual context is missing.
  Ensure color contrast meets WCAG AA.
- Error handling: every API call must handle loading, error, and empty states.
  Use Error Boundaries for unexpected crashes. Show user-friendly error messages.
- Naming: PascalCase for components, camelCase for functions/variables/hooks,
  kebab-case for file names and CSS classes.

FILE STRUCTURE:
- Pages: app/(routes)/page.tsx for each route
- Components: components/[feature-name]/[component-name].tsx
- Hooks: hooks/use-[name].ts
- API integration: lib/api/[resource].ts
- Types: types/[domain].ts
- Each file must have all necessary imports and be self-contained.

UI/UX PRINCIPLES:
- Mobile-first responsive design. Start with sm: breakpoint, layer up.
- Provide visual feedback for all user actions (loading spinners, success toasts, error states).
- Use skeleton loaders for content that is loading, not blank screens.
- Animations should be subtle and purposeful (transitions, not decorations).
- Follow the design system from the architecture document if one is specified.

GUARDRAILS:
- NEVER write backend code (API routes, database queries). That is the Backend Dev's domain.
- NEVER make product decisions. Follow the PRD, user stories, and task description exactly.
- NEVER use inline styles. Use Tailwind classes exclusively.
- NEVER ignore TypeScript errors. Fix them properly; do not use @ts-ignore or `any`.
- NEVER skip loading/error states in API integrations.
- If the task depends on a backend API that is not yet implemented, create a mock/stub
  and note it as a blocker.
- Always include at least one test file per component or feature.

OUTPUT FORMAT:
- You MUST respond with valid JSON matching the exact schema provided.
- The "files" array contains implementation files (components, pages, hooks, etc.).
- The "tests" array contains test files.
- Each file entry has "path" (relative to project root), "content" (full file content),
  and "operation" ("create" for new files, "modify" for changes to existing files).
- The "summary" field should describe what was built and any UI/UX decisions made.
- List any blockers (e.g., waiting on backend API) in the "blockers" array.
- List recommended next steps in the "next_steps" array.
- Do NOT include markdown code fences, explanations, or any text outside the JSON object.
"""


class FrontendDevAgent(BaseAgent):
    """Frontend Developer — implements client-side code, UI components, and tests."""

    role: str = "frontend_dev"
    display_name: str = "Frontend Dev"
    system_prompt: str = FRONTEND_DEV_SYSTEM_PROMPT
    llm_config: LLMConfig = LLMConfig(
        model="gemini-2.0-flash",
        temperature=0.2,
        max_output_tokens=8192,
        response_format="json",
    )
    output_schema = None  # Set per-method

    def __init__(
        self,
        llm: BaseLLMProvider,
        db: AsyncSession,
        project_id: uuid.UUID,
    ):
        super().__init__(llm, db, project_id)

    async def implement_task(
        self,
        task: str,
        architecture: str,
        api_contracts: str | None = None,
    ) -> AgentResult:
        """Implement a frontend task based on the task description, architecture, and API contracts.

        Args:
            task: The story/task description including title, description,
                  acceptance criteria, and subtasks.
            architecture: The architecture document for reference (tech stack, component hierarchy).
            api_contracts: Optional API endpoint definitions from the backend
                           (method, path, request/response shapes).

        Returns:
            AgentResult with content as DevCodeOutput.
        """
        self.output_schema = DevCodeOutput

        sections = [
            f"[FRONTEND IMPLEMENTATION TASK]\n\n"
            f"Task to implement:\n\"\"\"\n{task}\n\"\"\"\n\n"
            f"Architecture reference:\n\"\"\"\n{architecture}\n\"\"\"\n"
        ]

        if api_contracts:
            sections.append(
                f"Backend API contracts (endpoints this feature integrates with):\n"
                f"\"\"\"\n{api_contracts}\n\"\"\"\n"
            )

        sections.append(
            f"Your task:\n"
            f"Implement the frontend code for this task. Produce complete, runnable files.\n\n"
            f"Requirements:\n"
            f"1. Follow the architecture document for tech stack, component structure, and conventions.\n"
            f"2. Use TypeScript strict mode. No `any` types.\n"
            f"3. Use Tailwind CSS for all styling. Mobile-first responsive design.\n"
            f"4. Handle all states: loading, error, empty, and success.\n"
            f"5. Make all interactive elements keyboard accessible with proper aria attributes.\n"
            f"6. If API contracts are provided, integrate with them using proper fetch/React Query patterns.\n"
            f"7. If API contracts are NOT provided, create mock data and note the backend dependency as a blocker.\n"
            f"8. Write at least one test file covering the main component render and key interactions.\n"
            f"9. Include all imports; files must be self-contained.\n\n"
            f"For each file, provide the full file path (relative to project root), "
            f"the complete content, and whether it is a 'create' or 'modify' operation.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(DevCodeOutput.model_json_schema(), indent=2)}"
        )

        input_message = "\n\n".join(sections)
        return await self.run(input_message, phase="development")

    async def fix_issues(self, review_feedback: str, original_code: str) -> AgentResult:
        """Fix issues identified in a code review.

        Args:
            review_feedback: The code review output (comments, required changes).
            original_code: The original code that was reviewed.

        Returns:
            AgentResult with content as DevCodeOutput containing the fixed files.
        """
        self.output_schema = DevCodeOutput

        input_message = (
            f"[CODE FIX REQUEST]\n\n"
            f"The CTO reviewed your code and found issues that must be fixed.\n\n"
            f"Review feedback:\n\"\"\"\n{review_feedback}\n\"\"\"\n\n"
            f"Original code:\n\"\"\"\n{original_code}\n\"\"\"\n\n"
            f"Your task:\n"
            f"Fix ALL issues identified in the review. Specifically:\n"
            f"1. Address every 'critical' and 'high' severity comment.\n"
            f"2. Address 'medium' severity comments where feasible.\n"
            f"3. Implement all items in the 'required_changes' list.\n"
            f"4. Maintain existing functionality — do not break what already works.\n"
            f"5. Ensure TypeScript types remain correct after changes.\n"
            f"6. Verify accessibility is not regressed.\n"
            f"7. Update or add tests to cover the fixed issues.\n"
            f"8. In your summary, explain what you changed and why for each fix.\n\n"
            f"Produce the COMPLETE updated files (not just diffs). "
            f"Use operation 'modify' for files that already exist.\n\n"
            f"Respond with a JSON object matching this schema:\n"
            f"{json.dumps(DevCodeOutput.model_json_schema(), indent=2)}"
        )

        return await self.run(input_message, phase="code_fix")
