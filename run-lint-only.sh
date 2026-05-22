#!/bin/bash
cd /workspaces/matmetrics 2>/dev/null || exit 1
npm run lint 2>&1
