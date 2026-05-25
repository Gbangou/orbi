import { NextResponse, type NextRequest } from "next/server";
import { fetchAdminDrivers } from "@orbi/api";
import {
  createAdminServerAuthErrorResponse,
  getAdminServerAuthClient,
} from "../../../admin-server-auth";
import { createNoStoreAdminHeaders } from "../../../admin-server-security";

export const dynamic = "force-dynamic";

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const page = parsePositiveInteger(
    request.nextUrl.searchParams.get("page"),
    1,
  );
  const pageSize = Math.min(
    parsePositiveInteger(request.nextUrl.searchParams.get("pageSize"), 30),
    100,
  );
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const status = request.nextUrl.searchParams.get("status")?.trim();

  try {
    const authClient = await getAdminServerAuthClient();
    const response = await fetchAdminDrivers(authClient, {
      page,
      pageSize,
      search: search ? search.slice(0, 120) : undefined,
      status: status ?? undefined,
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
