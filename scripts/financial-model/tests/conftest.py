import pytest

@pytest.fixture
def sample_assumptions_path(tmp_path):
    """Shared fixture: a minimal valid assumptions.yaml path used by many tests.
    Real tests will override or extend this via parametrization."""
    return tmp_path / "assumptions.yaml"
