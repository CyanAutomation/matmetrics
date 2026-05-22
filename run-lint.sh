#!/bin/bash
cd /workspaces/matmetrics
npm run lint 2>&1 | tee lint-output.txt
