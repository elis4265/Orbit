import asyncio
from typing import List

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from app.core.config import settings

_SYSTEM_PROMPT = (
    "You are a senior software engineer helping break down development tasks. "
    "Given a task title and description, generate between 1 and 5 specific, "
    "actionable sub-tasks. Each sub-task must start with an imperative verb "
    "(e.g. \"Write\", \"Implement\", \"Add\", \"Configure\", \"Test\"). "
    "Be concrete and scoped — avoid vague steps like \"Handle edge cases\"."
)

_TIMEOUT_SECONDS = 15.0


class AISubTaskItem(BaseModel):
    title: str = Field(description="Granular, actionable step starting with an imperative verb.")


class AIBreakdownResult(BaseModel):
    sub_tasks: List[AISubTaskItem] = Field(max_length=5)


class AIService:
    def __init__(self) -> None:
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def generate_subtasks(
        self,
        task_title: str,
        task_description: str | None,
    ) -> AIBreakdownResult:
        desc = task_description or "(no description)"
        completion = await asyncio.wait_for(
            self._client.beta.chat.completions.parse(
                model="gpt-4o-mini",
                temperature=0.3,
                max_tokens=512,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": f"Task: {task_title}\nDescription: {desc}"},
                ],
                response_format=AIBreakdownResult,
            ),
            timeout=_TIMEOUT_SECONDS,
        )
        return completion.choices[0].message.parsed
