"use client";

import React from "react";
import {
  TemplateEditor,
  type TemplateEditorProps,
} from "./template-editor/template-editor";

export type TemplateWizardEditorProps = TemplateEditorProps;

/**
 * TemplateWizardEditor now forwards directly to the unified Split-View TemplateEditor
 * to maintain complete backward compatibility with existing page imports.
 */
export function TemplateWizardEditor(props: TemplateWizardEditorProps) {
  return <TemplateEditor {...props} />;
}

export { TemplateEditor };
