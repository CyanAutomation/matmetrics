#!/bin/bash
cd /workspaces/matmetrics
npm run verify 2>&1 | head -500
