#!/bin/bash

# Run both commands
npx tsx main "$@" & 
sleep 0.5
npx tsx cli.ts "$@"

# Wait for all background processes to complete
wait