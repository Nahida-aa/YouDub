import { createFormHook } from '@tanstack/solid-form';
import type { VariantProps } from 'class-variance-authority';
import { createEffect, splitProps } from 'solid-js';
import { SelectField, type SelectFieldProps } from './enum/SelectField';
import { FileInputField, type FileInputFieldProps } from './file/fileInput';
import {
	Form,
	FormFloatingSaveBar,
	fieldContext,
	formContext,
	NextButton,
	SubmitButton,
	SyncToLocalStorage,
	useFieldContext,
} from './form';
import {
	InputField,
	type InputFieldProps,
	InputGroupTextareaField,
	type InputGroupTextareaProps,
	TextareaField,
	type TextareaProps,
} from './text/InputField';
import { PasswordField } from './text/PasswordField';

export const { useAppForm } = createFormHook({
	fieldContext,
	formContext,
	fieldComponents: {
		InputField: (props: Omit<InputFieldProps, 'fieldId'>) => {
			const [local, others] = splitProps(props, ['invalid', 'errors']);
			const field = useFieldContext<string | undefined>();
			const invalid = () =>
				!field().state.meta.isValid && field().state.meta.isTouched;
			return (
				<InputField
					{...others}
					name={field().name}
					value={field().state.value}
					onBlur={field().handleBlur}
					onInput={(e) => field().handleChange(e.target.value)}
					invalid={invalid()}
					errors={field().state.meta.errors}
				/>
			);
		},
		TextareaField: (props: Omit<TextareaProps, 'fieldId'>) => {
			const [local, others] = splitProps(props, ['invalid', 'errors']);
			const field = useFieldContext<string | undefined>();
			const invalid = () =>
				!field().state.meta.isValid && field().state.meta.isTouched;
			return (
				<TextareaField
					{...others}
					name={field().name}
					value={field().state.value}
					onBlur={field().handleBlur}
					onInput={(e) => field().handleChange(e.target.value)}
					invalid={invalid()}
					errors={field().state.meta.errors}
				/>
			);
		},
		InputGroupTextareaField: (
			props: Omit<InputGroupTextareaProps, 'fieldId'>,
		) => {
			const [local, others] = splitProps(props, ['invalid', 'errors']);
			const field = useFieldContext<string | undefined>();
			const invalid = () =>
				!field().state.meta.isValid && field().state.meta.isTouched;
			return (
				<InputGroupTextareaField
					{...others}
					name={field().name}
					value={field().state.value}
					onBlur={field().handleBlur}
					onInput={(e) => field().handleChange(e.target.value)}
					invalid={invalid()}
					errors={field().state.meta.errors}
				/>
			);
		},
		PasswordField,
		FileInputField: (props: Omit<FileInputFieldProps, 'fieldId'>) => {
			const [local, others] = splitProps(props, ['invalid', 'errors']);
			const field = useFieldContext<File | undefined>();
			const invalid = () =>
				!field().state.meta.isValid && field().state.meta.isTouched;
			return (
				<FileInputField
					{...others}
					name={field().name}
					onValueChange={(f) => field().handleChange(f)}
					invalid={invalid()}
					errors={field().state.meta.errors}
				/>
			);
		},
		SelectField: (props: SelectFieldProps) => {
			const [local, others] = splitProps(props, [
				'invalid',
				'errors',
				'onChange',
			]);
			const field = useFieldContext<string | undefined>();
			const invalid = () =>
				!field().state.meta.isValid && field().state.meta.isTouched;
			return (
				<SelectField
					{...others}
					// options={others.options}
					name={field().name}
					value={others.options.find((o) => o.value === field().state.value)}
					onChange={(o) => field().handleChange(o?.value)}
					invalid={invalid()}
					errors={field().state.meta.errors}
				/>
			);
		},
	},
	formComponents: {
		NextButton,
		SubmitButton,
		Form,
		FormFloatingSaveBar,
		SyncToLocalStorage,
	},
});
