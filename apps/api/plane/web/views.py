# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET


def health_check(request):
    return JsonResponse({"status": "OK"})


@never_cache
@require_GET
def readiness_check(request):
    """Report readiness only after Django can execute a database query."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        return JsonResponse({"status": "UNAVAILABLE"}, status=503)

    return JsonResponse({"status": "OK"})


def robots_txt(request):
    return HttpResponse("User-agent: *\nDisallow: /", content_type="text/plain")
