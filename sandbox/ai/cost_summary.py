"""cost-log.jsonl을 모델·단계별 범위로 요약한다. docs/06의 실측 표를 고칠 때 쓴다.

    py sandbox/ai/cost_summary.py            # 전체
    py sandbox/ai/cost_summary.py --since 2026-11-10
"""
import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path

LOG = Path(__file__).with_name("cost-log.jsonl")


def rng(xs, fmt):
    xs = sorted(xs)
    if not xs:
        return "-"
    if len(xs) == 1:
        return fmt(xs[0])
    return f"{fmt(xs[0])} ~ {fmt(xs[-1])} (중앙 {fmt(statistics.median(xs))})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="")
    args = ap.parse_args()
    rows = [json.loads(line) for line in LOG.read_text(encoding="utf-8").splitlines() if line.strip()]
    rows = [r for r in rows if r["time"] >= args.since]
    groups = defaultdict(list)
    for r in rows:
        groups[(r["stage"], r["model"])].append(r)

    print("| 단계 | 모델 | 횟수 | 1회 비용 | 입력 토큰 | 출력 토큰 | 음성 길이 |")
    print("|---|---|---|---|---|---|---|")
    for (stage, model), rs in sorted(groups.items()):
        cost = rng([r["costUsd"] for r in rs], lambda x: f"${x:.3f}")
        tin = rng([r["inputTokens"] for r in rs if "inputTokens" in r], lambda x: f"{x/1000:.1f}k")
        tout = rng([r["outputTokens"] for r in rs if "outputTokens" in r], lambda x: f"{x/1000:.1f}k")
        sec = rng([r["newAudioSec"] for r in rs if "newAudioSec" in r], lambda x: f"{x:.0f}초")
        print(f"| {stage} | {model} | {len(rs)} | {cost} | {tin} | {tout} | {sec} |")
    print(f"\n합계 ${sum(r['costUsd'] for r in rows):.3f} ({len(rows)}회)")


if __name__ == "__main__":
    main()
