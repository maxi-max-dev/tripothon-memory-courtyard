#!/usr/bin/env python3
"""User-run, process-only key entry. Does not write credentials or call providers."""
import argparse
import getpass
import os
from pathlib import Path
import shutil
import socket
import sys

parser=argparse.ArgumentParser(description="Start the local demo after separately approving one paid test. Keys stay in process memory.")
parser.add_argument('--approved-test',action='store_true',help='User confirms at most one Agent, one image and one Draft generation; estimated reservation $0.35 (not a provider billing cap).')
args=parser.parse_args()
if not args.approved_test:
    parser.error('Approval is required. Read INTEGRATION.md before using --approved-test.')
if not sys.stdin.isatty():
    sys.exit('Run directly in your local Terminal. Do not pipe or paste credentials into chat.')
with socket.socket() as check:
    if check.connect_ex(('127.0.0.1',4317))==0:
        sys.exit('Port 4317 is in use. Stop the previous demo in its Terminal first.')
node=shutil.which('node')
if not node:
    sys.exit('Node was not found; no software will be installed automatically.')
print('At most one request per paid service in this database; failures retain the allowance. No credentials will be saved.')
keys={}
for name in ('OPENAI_API_KEY','WORLDLABS_API_KEY'):
    value=getpass.getpass(name+' (hidden, local only): ').strip()
    if not value:
        sys.exit('Empty key: nothing started.')
    keys[name]=value
env={**os.environ,**keys,'HOST':'127.0.0.1','PORT':'4317','ALLOW_PAID_PROVIDERS':'1','OPENAI_MODEL':'gpt-5.4-mini','OPENAI_IMAGE_MODEL':'gpt-image-1.5','WORLDLABS_MODEL':'marble-1.0-draft','PAID_TEST_MAX_AGENT_CALLS':'1','PAID_TEST_MAX_IMAGE_CALLS':'1','PAID_TEST_MAX_WORLD_CALLS':'1','PAID_TEST_BUDGET_USD':'0.35'}
root=Path(__file__).resolve().parent.parent
os.chdir(root)
os.execve(node,[node,'server.mjs'],env)
