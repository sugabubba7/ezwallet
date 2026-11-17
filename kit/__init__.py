"""Shared plumbing for the worker services: envelope schema, auth, idempotency, tracing.

This is a library, not a service: workers never import each other's code, only this.
"""
