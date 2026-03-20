"""
Root conftest.py — adds the project root to sys.path so pytest can find modules.
Service directories use hyphens (e.g. services/project-state/) which are invalid
Python package names, so tests load them explicitly via importlib (see helpers below).
"""
import sys
import os

# Add project root so that `import conftest` and test-internal helpers work
sys.path.insert(0, os.path.dirname(__file__))
