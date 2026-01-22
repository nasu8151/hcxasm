from types import FunctionType

def expect(expected, func : FunctionType, *args, **kwargs):
    result = func(*args, **kwargs)
    try:
        assert result == expected
    except AssertionError:
        raise AssertionError(f"[FAIL] {func.__name__}({args}, {kwargs}) == {result}, expected {expected}")
    restored_args = ", ".join(repr(a) for a in args)
    restored_kwargs = ", ".join(f"{k}={v!r}" for k, v in kwargs.items())
    if restored_kwargs:
        if restored_args:
            restored_args += ", " + restored_kwargs
        else:
            restored_args = restored_kwargs
    print(f"[OK] {func.__name__}({restored_args}) == {expected}")

def expect_raises(exc_type, func : FunctionType, *args, **kwargs):
    try:
        func(*args, **kwargs)
    except Exception as e:
        assert isinstance(e, exc_type)
        print(f"[OK] Raised expected exception: {e}")

def self_test():
    expect(2, lambda x,y: x + y, 1, 1)
    expect(3, lambda x, y, z: (x + z) * y, 1, z=2, y=1)
    expect_raises(ZeroDivisionError, lambda x: x / 0, 1)
    print("[OK] testfuncs.py : All tests passed.")

if __name__ == "__main__":
    self_test()