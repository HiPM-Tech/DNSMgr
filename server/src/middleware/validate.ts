import { Request, Response, NextFunction } from 'express';

type Schema = Record<string, { required?: boolean; type?: string }>;

export function validate(schema: Schema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const body = req.body as Record<string, unknown>;
    for (const [key, rules] of Object.entries(schema)) {
      if (rules.required && (body[key] === undefined || body[key] === null || body[key] === '')) {
        res.status(400).json({ code: -1, msg: `Missing required field: ${key}` });
        return;
      }
      if (body[key] !== undefined && rules.type && typeof body[key] !== rules.type) {
        res.status(400).json({ code: -1, msg: `Field ${key} must be of type ${rules.type}` });
        return;
      }
    }
    next();
  };
}
