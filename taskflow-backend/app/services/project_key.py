import re


def generate_project_key(name: str) -> str:
    """Derive a short uppercase key from a project name.

    Multi-word: first letter of each alpha word, capped at 6 chars.
    Single-word: first 4 chars.
    """
    words = [w for w in re.split(r'\s+', name) if re.search(r'[a-zA-Z]', w)]
    if len(words) > 1:
        key = ''.join(w[0] for w in words if w[0].isalpha())
        return key[:6].upper()
    alpha = re.sub(r'[^a-zA-Z]', '', name)
    return alpha[:4].upper()
