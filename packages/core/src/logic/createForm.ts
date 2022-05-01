import type { Ref } from 'vue'
import { reactive, ref, toRefs, unref, watch } from 'vue'
import type { FormState, UseFormHandleSubmit, UseFormProps, UseFormReturn } from '../types/form'
import type { Field, FieldElement, FieldValues } from '../types/filed'

import type { FieldError, FieldErrors } from '../types/errors'
import type { RegisterOptions } from '../types/validator'
import { deleteProperty, isEmptyObject, isHTMLElement, isString } from '../utils'

import { VALIDATION_MODE } from '../shared/constant'
import { getValidationMode } from '../utils/getValidationMode'
import type { UnpackNestedValue } from '../types/utils'
import { validateField } from './validate'

const onModelValueUpdate = 'onUpdate:modelValue'

export function createForm<
  TFieldValues extends FieldValues = FieldValues,
  TContext = any,
  >(
  _options: UseFormProps<TFieldValues, TContext> = {},
) {
  const fields = {} as Record<keyof TFieldValues, Field>

  const formState = reactive<FormState<TFieldValues>>({
    isDirty: false,
    isValidating: false,
    // dirtyFields: {} as FieldNamesMarkedBoolean<TFieldValues>,
    isSubmitted: false,
    submitCount: 0,
    // touchedFields: {} as FieldNamesMarkedBoolean<TFieldValues>,
    isSubmitting: false,
    isSubmitSuccessful: false,
    isValid: false,
    errors: {} as FieldErrors<TFieldValues>,
  }) as FormState<TFieldValues>

  const validationModeBeforeSubmit = getValidationMode(_options.mode!)
  const validationModeAfterSubmit = getValidationMode(_options.reValidateMode!)
  const shouldDisplayAllAssociatedErrors
    = _options.criteriaMode === VALIDATION_MODE.all

  const _transformRef = (ref: Ref<FieldElement | any>) => {
    const unwrap = unref(ref)
    let el

    if (isHTMLElement(unwrap))
      el = unwrap

    else if (isHTMLElement(unwrap?.$el))
      el = unwrap.$el

    else if (isHTMLElement(unwrap?.ref?.value))
      el = unwrap.ref.value

    if ((el as FieldElement).tagName === 'INPUT' || (el as FieldElement).tagName === 'SELECT' || (el as FieldElement).tagName === 'TEXTAREA')
      return el

    return el.querySelectorAll('input, select, textarea')[0]
  }

  const _validateFieldByName = async (fieldName: keyof TFieldValues) => {
    const res = await validateField(fields[fieldName], shouldDisplayAllAssociatedErrors)

    if (Object.keys(res).length)
      (formState.errors[fieldName] as FieldError) = res
    else
      deleteProperty(formState.errors, fieldName as string)
  }

  const _validateFields = async () => {
    for (const fieldName of Object.keys(fields)) {
      await _validateFieldByName(fieldName)
    }
  }

  const onChange = async (name: keyof TFieldValues) => {
    formState.isDirty = true

    await _validateFieldByName(name)
  }

  const handleSubmit: UseFormHandleSubmit<TFieldValues> = (onSubmit, onError?) => {
    return async (e) => {
      await _validateFields()
      if (!isEmptyObject(formState.errors)) {
        if (onError)
          onError(formState.errors, e)

        return
      }
      const res: Record<string, any> = {}
      for (const fieldName in fields) {
        res[fieldName] = fields[fieldName].inputValue
      }
      onSubmit(fields as UnpackNestedValue<TFieldValues>, e)
    }
  }

  const register = (name: keyof TFieldValues, options: RegisterOptions) => {
    const modelVal = ref(fields[name]?.inputValue || '')
    const elRef = ref<FieldElement | null>(null)

    if (!fields[name]) {
      fields[name] = {} as Field
      assignBindAttrs()
    }

    if (options.value) {
      fields[name].inputValue = options.value
      deleteProperty(options, 'value')
    }

    watch(elRef, (newEl) => {
      if (newEl) {
        const el = _transformRef(elRef)
        if (isHTMLElement(el)) {
          fields[name].ref = el as FieldElement
        }
      }
    })

    function assignBindAttrs(el: FieldElement = {} as any, newValue = options.value) {
      elRef.value = el
      modelVal.value = modelVal
      fields[name] = {
        inputValue: newValue,
        rule: { ...options },
        ref: elRef.value!,
        name: name as string,
      }
    }

    return {
      ref: elRef,
      modelValue: modelVal.value,
      onBlur: () => {
        if (validationModeBeforeSubmit.isOnBlur)
          onChange(name)
      },
      [onModelValueUpdate]: (newValue: TFieldValues[keyof TFieldValues]) => {
        assignBindAttrs(_transformRef(elRef), newValue)
        if (validationModeBeforeSubmit.isOnChange)
          onChange(name)
      },
      onInput(evt: InputEvent) {
        // filter UI Component
        if (isString(evt))
          return
        assignBindAttrs(_transformRef(elRef), (evt.target as HTMLInputElement).value)
        if (validationModeBeforeSubmit.isOnChange)
          onChange(name)
      },
    }
  }

  const useRegister = (name: keyof TFieldValues, options: RegisterOptions) => () => register(name, options)

  return {
    register,
    formState: toRefs(formState),
    useRegister,
    handleSubmit,
  }
}
