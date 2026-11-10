import unittest

from pipeline.korean_numbers import native, sino, spoken_text


class KoreanNumbersTest(unittest.TestCase):
    def test_sino(self):
        self.assertEqual(sino(0), "영")
        self.assertEqual(sino(14), "십사")
        self.assertEqual(sino(105), "백오")
        self.assertEqual(sino(10000), "만")

    def test_native(self):
        self.assertEqual(native(1), "한")
        self.assertEqual(native(20), "스무")
        self.assertEqual(native(21), "스물한")
        self.assertEqual(native(120), "백이십")

    def test_values_read_as_sino(self):
        self.assertEqual(spoken_text("다음 선수 2가 나와요."), "다음 선수 이가 나와요.")
        self.assertEqual(spoken_text("14가 이겨서 C에 써요."), "십사가 이겨서 C에 써요.")
        self.assertEqual(spoken_text("6 대 15를 비교해요."), "육 대 십오를 비교해요.")

    def test_counts_read_as_native(self):
        self.assertEqual(spoken_text("모두 11개예요."), "모두 열한 개예요.")
        self.assertEqual(spoken_text("29 대 30은 9번째예요."), "이십구 대 삼십은 아홉 번째예요.")
        self.assertEqual(spoken_text("비교는 9번이에요."), "비교는 아홉 번이에요.")

    def test_labels_and_formulas_read_as_sino(self):
        self.assertEqual(spoken_text("1번 줄은 조건이에요."), "일 번 줄은 조건이에요.")
        self.assertEqual(spoken_text("2번부터 4번 줄"), "이 번부터 사 번 줄")
        self.assertEqual(spoken_text("a 더하기 b 빼기 1번이에요."), "a 더하기 b 빼기 일 번이에요.")
        self.assertEqual(spoken_text("비교 10회"), "비교 십회")

    def test_no_digits_unchanged(self):
        self.assertEqual(spoken_text("합병은 빅오 n이에요."), "합병은 빅오 n이에요.")


if __name__ == "__main__":
    unittest.main()
