import math


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def count_valid_observations(values):
    return sum(1 for value in values if is_number(value))


def count_missing_observations(values):
    return sum(1 for value in values if value is None)


def count_zero_observations(values):
    return sum(1 for value in values if is_number(value) and value == 0)


def zero_ratio(values):
    observation_count = count_valid_observations(values)
    if observation_count == 0:
        return 0.0

    return count_zero_observations(values) / observation_count
