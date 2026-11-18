"""Contain one Git sync command; credential input is fixed and never an argument/file."""
import argparse
import importlib.util
import math
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--timeout', type=float, required=True)
    parser.add_argument('--max-output', type=int, required=True)
    parser.add_argument('--credential', action='store_true')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command or not math.isfinite(args.timeout) or not 0 < args.timeout <= 600 or not 0 < args.max_output <= 2 * 1024 * 1024:
        parser.error('A command and finite sync limits are required.')
    if args.credential and (args.timeout > 30 or args.max_output > 32768 or command[1:] != ['credential', 'fill']):
        parser.error('Invalid credential-helper operation.')
    module_path = Path(__file__).with_name('project-command.py')
    spec = importlib.util.spec_from_file_location('owned_project_command', module_path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
        result, reason = module.run_command(command, timeout=args.timeout, max_output=args.max_output,
            input=b'protocol=https\nhost=github.com\n\n' if args.credential else None)
    except (OSError, RuntimeError, ValueError):
        print('The sync command could not be started or contained.', file=sys.stderr)
        return 126
    if reason:
        # Never echo partial credentials or raw child diagnostics on a refused helper.
        print('The sync command exceeded its ' + reason + '.', file=sys.stderr)
        return 124 if reason == 'timeout' else 125 if reason == 'output-limit' else 127
    if args.credential and result.returncode:
        print('The existing credential helper did not finish.', file=sys.stderr)
        return result.returncode
    sys.stdout.buffer.write(result.stdout)
    if not args.credential:
        sys.stderr.buffer.write(result.stderr)
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
