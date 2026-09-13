import math
from dataclasses import dataclass


IRT_CALIBRATION_TARGET_STUDENTS = 500


@dataclass(frozen=True)
class IRTConfig:
    calibration_target_students: int = IRT_CALIBRATION_TARGET_STUDENTS
    min_item_responses: int = 30
    min_student_responses: int = 3
    learning_rate: float = 0.25


DEFAULT_IRT_CONFIG = IRTConfig()


def probability_correct(ability: float, difficulty: float) -> float:
    exponent = max(-35.0, min(35.0, ability - difficulty))
    return 1.0 / (1.0 + math.exp(-exponent))


def update_ability(ability: float | None, difficulty: float, correct: bool, config: IRTConfig = DEFAULT_IRT_CONFIG) -> float:
    current = 0.0 if ability is None else float(ability)
    observed = 1.0 if correct else 0.0
    predicted = probability_correct(current, difficulty)
    return max(-4.0, min(4.0, current + config.learning_rate * (observed - predicted)))


def calibration_status(
    distinct_students: int,
    response_count: int,
    correct_count: int,
    previous_status: str = "expert_initialized",
    config: IRTConfig = DEFAULT_IRT_CONFIG,
) -> str:
    if response_count <= 0:
        return "expert_initialized"
    if distinct_students < config.calibration_target_students or response_count < config.min_item_responses:
        return "insufficient_data"
    if correct_count <= 0 or correct_count >= response_count:
        return "needs_recalibration"
    if previous_status == "calibrated":
        return "calibrated"
    return "calibrating"
