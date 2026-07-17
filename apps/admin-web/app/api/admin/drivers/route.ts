import { NextResponse, type NextRequest } from "next/server";
import { fetchAdminDrivers } from "@orbi/api";
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from "../../../admin-server-auth";
import {
  createNoStoreAdminHeaders,
  resolveAdminDriverStatusFilter,
  resolveStrictBoundedInteger,
} from "../../../admin-server-security";

export const dynamic = "force-dynamic";

function parsePositiveInteger(value: string | null, fallback: number) {
  return resolveStrictBoundedInteger(value, {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    fallback,
  });
}

export async function GET(request: NextRequest) {
  const page = parsePositiveInteger(
    request.nextUrl.searchParams.get("page"),
    1,
  );
  const pageSize = resolveStrictBoundedInteger(
    request.nextUrl.searchParams.get("pageSize"),
    { min: 1, max: 100, fallback: 30, clampMax: true },
  );
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const status = resolveAdminDriverStatusFilter(
    request.nextUrl.searchParams.get("status"),
  );

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminDrivers(authClient, {
      page,
      pageSize,
      search: search ? search.slice(0, 120) : undefined,
      status,
    });

    return NextResponse.json(response, {
      headers: createNoStoreAdminHeaders(),
    });
  } catch (error) {
    return createAdminServerAuthErrorResponse(
      error,
      "Unable to fetch drivers.",
    );
  }
}
