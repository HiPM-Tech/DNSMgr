import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Response } from 'express';
import { ResponseHelper, ApiResponse } from './response';

// Mock Response object
function createMockResponse(): { res: Partial<Response>; jsonData: any; statusCode: number } {
  const jsonData: any = null;
  let statusCode = 200;
  
  const res: Partial<Response> = {
    status(code: number) {
      statusCode = code;
      return this as Response;
    },
    json(data: any) {
      (jsonData as any) = data;
      return this as Response;
    },
    send() {
      return this as Response;
    },
  };
  
  return { res, jsonData, statusCode };
}

describe('ResponseHelper', () => {
  describe('success', () => {
    it('should return success response with code 0', () => {
      const { res } = createMockResponse();
      ResponseHelper.success(res as Response, { id: 1 }, 'Success');
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 0);
      assert.strictEqual(jsonData.msg, 'Success');
      assert.deepStrictEqual(jsonData.data, { id: 1 });
      assert.ok(jsonData.timestamp);
    });

    it('should return success response without data', () => {
      const { res } = createMockResponse();
      ResponseHelper.success(res as Response, undefined, 'Success');
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 0);
      assert.strictEqual(jsonData.msg, 'Success');
      assert.strictEqual(jsonData.data, undefined);
    });
  });

  describe('error', () => {
    it('should return error response with status code', () => {
      const { res } = createMockResponse();
      ResponseHelper.error(res as Response, 'Bad Request', 400);
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 400);
      assert.strictEqual(jsonData.msg, 'Bad Request');
    });

    it('should return error response with data', () => {
      const { res } = createMockResponse();
      ResponseHelper.error(res as Response, 'Validation Error', 422, { field: 'email' });
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 422);
      assert.strictEqual(jsonData.msg, 'Validation Error');
      assert.deepStrictEqual(jsonData.data, { field: 'email' });
    });
  });

  describe('paginated', () => {
    it('should return paginated response', () => {
      const { res } = createMockResponse();
      const items = [{ id: 1 }, { id: 2 }];
      ResponseHelper.paginated(res as Response, items, 100, 1, 10);
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 0);
      assert.strictEqual(jsonData.data.items.length, 2);
      assert.strictEqual(jsonData.data.pagination.total, 100);
      assert.strictEqual(jsonData.data.pagination.page, 1);
      assert.strictEqual(jsonData.data.pagination.pageSize, 10);
      assert.strictEqual(jsonData.data.pagination.totalPages, 10);
    });
  });

  describe('convenience methods', () => {
    it('badRequest should return 400', () => {
      const { res } = createMockResponse();
      ResponseHelper.badRequest(res as Response, 'Invalid input');
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 400);
      assert.strictEqual(jsonData.msg, 'Invalid input');
    });

    it('unauthorized should return 401', () => {
      const { res } = createMockResponse();
      ResponseHelper.unauthorized(res as Response);
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 401);
      assert.strictEqual(jsonData.msg, 'Unauthorized');
    });

    it('forbidden should return 403', () => {
      const { res } = createMockResponse();
      ResponseHelper.forbidden(res as Response);
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 403);
      assert.strictEqual(jsonData.msg, 'Forbidden');
    });

    it('notFound should return 404', () => {
      const { res } = createMockResponse();
      ResponseHelper.notFound(res as Response, 'Resource not found');
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 404);
      assert.strictEqual(jsonData.msg, 'Resource not found');
    });

    it('internalError should return 500', () => {
      const { res } = createMockResponse();
      ResponseHelper.internalError(res as Response, 'Server error');
      
      const jsonData = (res as any).jsonData;
      assert.strictEqual(jsonData.code, 500);
      assert.strictEqual(jsonData.msg, 'Server error');
    });
  });
});
