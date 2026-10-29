import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { createAuthMiddleware } from "../middleware/auth.js";

describe("Static Bearer Authentication Middleware", () => {
  const EXPECTED_TOKEN = "test-secret-token-12345";
  const authMiddleware = createAuthMiddleware(EXPECTED_TOKEN);

  const mockRequestResponse = (authHeader?: string) => {
    const req = {
      headers: {
        ...(authHeader !== undefined ? { authorization: authHeader } : {}),
      },
    } as unknown as Request;

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;

    const next = vi.fn() as unknown as NextFunction;

    return { req, res, next };
  };

  it("should return 401 when Authorization header is missing", () => {
    const { req, res, next } = mockRequestResponse();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when token format is not Bearer (e.g. Basic abc)", () => {
    const { req, res, next } = mockRequestResponse("Basic dXNlcjpwYXNz");

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when header contains only 'Bearer' without token", () => {
    const { req, res, next } = mockRequestResponse("Bearer ");

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when header contains extra trailing arguments", () => {
    const { req, res, next } = mockRequestResponse(`Bearer ${EXPECTED_TOKEN} extra-arg`);

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when token string does not match EXPECTED_TOKEN (same length)", () => {
    const { req, res, next } = mockRequestResponse("Bearer test-secret-token-99999");

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should return 401 when token string does not match EXPECTED_TOKEN (different length)", () => {
    const { req, res, next } = mockRequestResponse("Bearer short");

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("should call next() when valid Bearer token is provided", () => {
    const { req, res, next } = mockRequestResponse(`Bearer ${EXPECTED_TOKEN}`);

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("should support case-insensitive Bearer prefix ('bearer', 'BEARER')", () => {
    const { req: reqLower, res: resLower, next: nextLower } = mockRequestResponse(`bearer ${EXPECTED_TOKEN}`);

    authMiddleware(reqLower, resLower, nextLower);
    expect(nextLower).toHaveBeenCalledTimes(1);

    const { req: reqUpper, res: resUpper, next: nextUpper } = mockRequestResponse(`BEARER ${EXPECTED_TOKEN}`);

    authMiddleware(reqUpper, resUpper, nextUpper);
    expect(nextUpper).toHaveBeenCalledTimes(1);
  });
});
