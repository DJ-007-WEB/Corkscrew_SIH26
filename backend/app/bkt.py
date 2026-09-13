from dataclasses import dataclass


@dataclass(frozen=True)
class BKTParams:
    initial_mastery: float = 0.35
    learn: float = 0.12
    guess: float = 0.2
    slip: float = 0.1


DEFAULT_BKT_PARAMS = BKTParams()


def clamp_probability(value: float) -> float:
    return max(0.01, min(0.99, float(value)))


def update_mastery(prior: float | None, correct: bool, params: BKTParams = DEFAULT_BKT_PARAMS) -> float:
    p_known = clamp_probability(params.initial_mastery if prior is None else prior)
    if correct:
        likelihood = p_known * (1 - params.slip)
        denominator = likelihood + (1 - p_known) * params.guess
    else:
        likelihood = p_known * params.slip
        denominator = likelihood + (1 - p_known) * (1 - params.guess)
    posterior = likelihood / denominator if denominator else p_known
    return clamp_probability(posterior + (1 - posterior) * params.learn)
