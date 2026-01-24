from types import FunctionType
import difflib
import os
from pathlib import Path
import sys
import subprocess

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

def expect_assemble(expected_file, infile, outfile, format_type='ihex', arch='HC4', extra_args=None):
    """アセンブル結果が期待通りか確認する"""
    project_root = Path(__file__).parent.parent
    temp_dir = project_root / '__temp__'
    if not temp_dir.exists():
        temp_dir.mkdir()
    cmd = [sys.executable, 'hcxasm.py', infile, '--format', format_type, '--architecture', arch]
    if outfile:
        cmd += ['--output', outfile]
    if extra_args:
        cmd += extra_args
    subprocess.run(cmd, check=True, cwd=project_root)
    
    # 期待ファイルと出力ファイルを比較
    with open(expected_file, 'rb') as f:
        expected_data = f.read()
    with open(outfile, 'rb') as f:
        output_data = f.read()
    
    if expected_data != output_data:
        diff = difflib.unified_diff(
            expected_data.decode(errors='ignore').splitlines(keepends=True),
            output_data.decode(errors='ignore').splitlines(keepends=True),
            fromfile='expected',
            tofile='output'
        )
        diff_text = ''.join(diff)
        raise AssertionError(f"[FAIL] Assembled output does not match expected.\nDiff:\n{diff_text}")
    
    print(f"[OK] Assembled output matches expected for {infile}.")


def self_test():
    expect(2, lambda x,y: x + y, 1, 1)
    expect(3, lambda x, y, z: (x + z) * y, 1, z=2, y=1)
    expect_raises(ZeroDivisionError, lambda x: x / 0, 1)
    print("[OK] testfuncs.py : All tests passed.")

if __name__ == "__main__":
    self_test()