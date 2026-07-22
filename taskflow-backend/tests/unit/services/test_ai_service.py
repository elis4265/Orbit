import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.ai import AIService, AIBreakdownResult, AISubTaskItem


@pytest.fixture
def ai_service():
    return AIService()


@pytest.mark.asyncio
async def test_generate_subtasks_returns_parsed_result(ai_service):
    expected = AIBreakdownResult(sub_tasks=[
        AISubTaskItem(title="Write unit tests for the auth module"),
        AISubTaskItem(title="Implement JWT refresh logic"),
    ])

    mock_choice = MagicMock()
    mock_choice.message.parsed = expected
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]

    with patch.object(
        ai_service._client.beta.chat.completions,
        "parse",
        new=AsyncMock(return_value=mock_completion),
    ):
        result = await ai_service.generate_subtasks("Auth module", "JWT-based auth")

    assert len(result.sub_tasks) == 2
    assert result.sub_tasks[0].title == "Write unit tests for the auth module"


@pytest.mark.asyncio
async def test_generate_subtasks_times_out():
    service = AIService()

    async def slow_parse(*args, **kwargs):
        await asyncio.sleep(999)

    with patch.object(
        service._client.beta.chat.completions,
        "parse",
        new=slow_parse,
    ):
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(
                service.generate_subtasks("Slow Task", None),
                timeout=0.1,
            )


@pytest.mark.asyncio
async def test_generate_subtasks_sends_correct_model(ai_service):
    expected = AIBreakdownResult(sub_tasks=[AISubTaskItem(title="Add endpoint")])
    mock_choice = MagicMock()
    mock_choice.message.parsed = expected
    mock_completion = MagicMock()
    mock_completion.choices = [mock_choice]

    mock_parse = AsyncMock(return_value=mock_completion)
    with patch.object(ai_service._client.beta.chat.completions, "parse", new=mock_parse):
        await ai_service.generate_subtasks("Task", "Desc")

    call_kwargs = mock_parse.call_args.kwargs
    assert call_kwargs["model"] == "gpt-4o-mini"
    assert call_kwargs["temperature"] == 0.3
    assert call_kwargs["max_tokens"] == 512
