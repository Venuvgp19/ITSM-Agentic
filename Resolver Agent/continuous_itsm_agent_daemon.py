#!/usr/bin/env python3
"""
Enterprise ITSM Self-Learning Resolver Agent Daemon
---------------------------------------------------
Main executable entrypoint and backward-compatible module re-exporter.
Modular architecture implemented in the 'daemon' package.
"""

import sys
import os

# Ensure package root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from daemon import *
from daemon import __all__ as _daemon_all

__all__ = list(_daemon_all)

if __name__ == "__main__":
    start_continuous_monitoring()
