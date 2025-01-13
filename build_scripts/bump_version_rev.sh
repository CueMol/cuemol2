#!/bin/bash

bump-my-version --allow-dirty --verbose build

# XXX: tag/commit?
bump-my-version --allow-dirty --verbose patch
