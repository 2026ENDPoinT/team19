"""음성용 숫자 읽기. 자막은 아라비아 숫자 그대로 두고, TTS에 보내는 글만 한글 읽기로 바꾼다.

TTS가 "2가"를 "두가", "14가"를 "열네가"처럼 고유어로 읽는 문제가 있다(2026-11-10 팀장 청취).
기본은 한자어(일, 이, 십사)로 읽고, 개수·순서를 세는 말 앞에서만 고유어(한, 두, 열한)로 읽는다.

    spoken_text("14가 이겨요. 모두 11개, 9번째예요.")
    → "십사가 이겨요. 모두 열한 개, 아홉 번째예요."
"""

from __future__ import annotations

import re

_SINO_DIGITS = "영일이삼사오육칠팔구"
_NATIVE_ONES = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"]
_NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"]

# 이 말 앞의 숫자는 고유어로 읽는다(개수, 순서). "단계", "회", "배"처럼 한자어 단위는 넣지 않는다.
_NATIVE_COUNTERS = ("번째", "개", "명", "마리", "가지", "살", "시간", "칸", "줄", "쌍", "권", "잔")
# "N번" 뒤에 이 말이 오면 이름표(1번 줄, 2번부터)라서 한자어로 읽는다. 그 밖의 "N번"은 횟수(9번이에요)로 본다.
_LABEL_AFTER_BEON = ("줄", "부터", "까지", "합병", "문제", "항목", "칸", "쪽", "노드", "원소", "인덱스", "에서", "과 ", "와 ", "은 ", "는 ")

_OPERATORS = ("더하기", "빼기", "곱하기", "나누기")

_NUMBER = re.compile(r"\d+(?:\.\d+)?")


def sino(n: int) -> str:
    """한자어 읽기. 14 → 십사, 105 → 백오, 0 → 영."""
    if n == 0:
        return "영"
    out = []
    for unit_value, unit in ((10**8, "억"), (10**4, "만")):
        if n >= unit_value:
            head, n = divmod(n, unit_value)
            out.append(("" if head == 1 and unit == "만" else _under_10000(head)) + unit)
    if n:
        out.append(_under_10000(n))
    return "".join(out)


def _under_10000(n: int) -> str:
    s = ""
    for value, unit in ((1000, "천"), (100, "백"), (10, "십")):
        d, n = divmod(n, value)
        if d:
            s += ("" if d == 1 else _SINO_DIGITS[d]) + unit
    if n:
        s += _SINO_DIGITS[n]
    return s


def native(n: int) -> str:
    """고유어 읽기(단위 앞 모양). 1 → 한, 20 → 스무, 21 → 스물한. 100 이상은 한자어."""
    if not 1 <= n <= 99:
        return sino(n)
    tens, ones = divmod(n, 10)
    if n == 20:
        return "스무"
    return _NATIVE_TENS[tens] + _NATIVE_ONES[ones]


def spoken_text(text: str) -> str:
    """문장 속 숫자를 소리 나는 대로 한글로 바꾼다."""
    def repl(m: re.Match) -> str:
        token, rest = m.group(0), text[m.end():]
        if "." in token:
            whole, frac = token.split(".")
            return sino(int(whole)) + " 점 " + " ".join(_SINO_DIGITS[int(d)] for d in frac)
        n = int(token)
        after = rest.lstrip(" ")
        if text[:m.start()].rstrip().endswith(_OPERATORS):   # 계산식 안: "b 빼기 1번" → "빼기 일 번"
            return sino(n) + (" " if after.startswith(("번", *_NATIVE_COUNTERS)) else "")
        if after.startswith(_NATIVE_COUNTERS):
            return native(n) + " "
        if after.startswith("번"):
            label = after[1:].lstrip(" ") if after[1:2] == " " else after[1:]
            if after[1:].startswith(_LABEL_AFTER_BEON) or label.startswith(_LABEL_AFTER_BEON):
                return sino(n) + " "
            return native(n) + " "
        return sino(n)

    out = _NUMBER.sub(repl, text)
    return re.sub(r" {2,}", " ", out)
