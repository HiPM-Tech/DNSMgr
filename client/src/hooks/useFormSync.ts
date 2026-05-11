import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 通用表单同步 Hook
 * 
 * 解决 useEffect 依赖项配置不当导致的表单预填充问题
 * 提供统一的表单状态同步、字段更新和重置功能
 * 
 * @param initial - 初始数据对象（编辑时传入，创建时为 undefined）
 * @param defaultValues - 默认值配置（创建时的初始值）
 * @param options - 可选配置
 * @returns formState - 表单状态对象
 * @returns updateField - 更新单个字段的方法
 * @returns updateFields - 批量更新字段的方法
 * @returns resetForm - 重置表单的方法
 * @returns isDirty - 表单是否已被修改
 * 
 * @example
 * // 简单用法
 * const { formState, updateField } = useFormSync(
 *   initial,
 *   { name: '', type: 'A' },
 *   { fields: ['name', 'type'] }
 * );
 * 
 * @example
 * // 使用转换器
 * const { formState, updateField } = useFormSync(
 *   initial,
 *   { enabled: false, port: 8080 },
 *   {
 *     transformers: {
 *       enabled: (v) => toBoolean(v),
 *       port: (v) => toNumber(v, 8080),
 *     },
 *   }
 * );
 */
export function useFormSync<T extends Record<string, any>>(
  initial: T | undefined | null,
  defaultValues: Partial<T>,
  options?: {
    /** 需要同步的字段列表，默认为 defaultValues 的所有键 */
    fields?: Array<keyof T>;
    /** 字段转换器，用于特殊字段的格式转换（如 toBoolean, toNumber） */
    transformers?: {
      [K in keyof T]?: (value: any) => any;
    };
    /** 是否在 initial 变化时自动重置（默认 true） */
    autoReset?: boolean;
  }
) {
  const [formState, setFormState] = useState<Partial<T>>(defaultValues);
  const [isDirty, setIsDirty] = useState(false);
  
  // 使用 ref 追踪上一次的 initial id，避免不必要的重新渲染
  const previousInitialIdRef = useRef<number | string | undefined>(undefined);
  
  // 使用 ref 存储配置，避免对象引用导致 useEffect 无限触发
  const configRef = useRef({
    fields: options?.fields || (Object.keys(defaultValues) as Array<keyof T>),
    transformers: options?.transformers || {},
    autoReset: options?.autoReset !== false,
    defaultValues,
  });
  
  // 只在首次渲染或 options 变化时更新 configRef
  useEffect(() => {
    configRef.current = {
      fields: options?.fields || (Object.keys(defaultValues) as Array<keyof T>),
      transformers: options?.transformers || {},
      autoReset: options?.autoReset !== false,
      defaultValues,
    };
  }, [options?.fields, options?.transformers, options?.autoReset, defaultValues]);

  // 同步 initial 到 formState
  useEffect(() => {
    const { fields, transformers, autoReset, defaultValues: defaults } = configRef.current;
    
    if (!initial) {
      // initial 为空时（创建模式），重置为默认值
      setFormState({ ...defaults });
      setIsDirty(false);
      previousInitialIdRef.current = undefined;
      return;
    }

    // 检测是否是新的编辑对象（通过 id 判断）
    const currentId = (initial as any).id;
    const isNewObject = currentId !== previousInitialIdRef.current;
    
    if (isNewObject || !autoReset) {
      const updates: Partial<T> = {};
      
      fields.forEach(field => {
        const value = initial[field];
        const transformer = (transformers as any)[field as string] as ((value: any) => any) | undefined;
        
        // 应用转换器（如果有），否则使用值或默认值
        updates[field] = transformer 
          ? transformer(value) 
          : (value ?? defaults[field]);
      });
      
      setFormState(updates);
      setIsDirty(false);
      previousInitialIdRef.current = currentId;
    }
  }, [initial]);

  // 更新单个字段
  const updateField = useCallback((field: keyof T, value: any) => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
    }));
    setIsDirty(true);
  }, []);

  // 批量更新字段
  const updateFields = useCallback((updates: Partial<T>) => {
    setFormState(prev => ({
      ...prev,
      ...updates,
    }));
    setIsDirty(true);
  }, []);

  // 重置表单到初始状态
  const resetForm = useCallback(() => {
    const { fields, transformers, defaultValues: defaults } = configRef.current;
    
    if (initial) {
      // 编辑模式：重置为 initial 值
      const updates: Partial<T> = {};
      fields.forEach((field: keyof T) => {
        const transformer = (transformers as any)[field as string] as ((value: any) => any) | undefined;
        updates[field] = transformer 
          ? transformer(initial[field]) 
          : (initial[field] ?? defaults[field]);
      });
      setFormState(updates);
    } else {
      // 创建模式：重置为默认值
      setFormState({ ...defaults });
    }
    setIsDirty(false);
  }, [initial]);

  return {
    formState,
    updateField,
    updateFields,
    resetForm,
    isDirty,
  };
}

export default useFormSync;
