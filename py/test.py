import testfuncs as tf
import assembler

if __name__ == "__main__":
    tf.self_test()
    assembler.self_test()
    tf.expect_assemble(
        expected_file='py/test_files/alltest.hex',
        infile='py/test_files/alltest.asm',
        outfile='./__temp__/alltest.hex',
        format_type='ihex',
        arch='HC4'
    )
    tf.expect_assemble(
        expected_file='py/test_files/countlcd.hex',
        infile='py/test_files/countlcd.asm',
        outfile='./__temp__/countlcd.hex',
        format_type='ihex',
        arch='HC4'
    )
    tf.expect_assemble(
        expected_file='py/test_files/dice4e.hex',
        infile='py/test_files/dice4e.asm',
        outfile='./__temp__/dice4e.hex',
        format_type='ihex',
        arch='HC4E'
    )
    tf.expect_assemble(
        expected_file='py/test_files/macrotest.hex',
        infile='py/test_files/macrotest.asm',
        outfile='./__temp__/macrotest.hex',
        format_type='vhex',
        arch='HC4'
    )

    print("[OK] test.py : All tests passed.")
