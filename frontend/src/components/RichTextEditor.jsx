import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Quote, Code } from 'lucide-react';

const MenuBar = ({ editor }) => {
  if (!editor) return null;

  return (
    <div className="editor-menu">
      <button 
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()} 
        className={editor.isActive('bold') ? 'active' : ''}
      >
        <Bold size={14} />
      </button>
      <button 
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()} 
        className={editor.isActive('italic') ? 'active' : ''}
      >
        <Italic size={14} />
      </button>
      <button 
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()} 
        className={editor.isActive('bulletList') ? 'active' : ''}
      >
        <List size={14} />
      </button>
      <button 
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()} 
        className={editor.isActive('orderedList') ? 'active' : ''}
      >
        <ListOrdered size={14} />
      </button>
      <button 
        type="button"
        onClick={() => editor.chain().focus().toggleBlockquote().run()} 
        className={editor.isActive('blockquote') ? 'active' : ''}
      >
        <Quote size={14} />
      </button>
      <button 
        type="button"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()} 
        className={editor.isActive('codeBlock') ? 'active' : ''}
      >
        <Code size={14} />
      </button>
    </div>
  );
};

export function RichTextEditor({ content, onChange, placeholder = 'Write something...', readOnly = false }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose-editor',
      },
    },
  });

  React.useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  React.useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly);
    }
  }, [readOnly, editor]);

  return (
    <div className="editor-container">
      {!readOnly && <MenuBar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
