import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  IconButton,
  Divider,
  Button,
  Menu,
  MenuItem,
  ListItemText,
} from "@mui/material";
import {
  FormatBold,
  FormatItalic,
  FormatStrikethrough,
  FormatListBulleted,
  FormatListNumbered,
  Undo,
  Redo,
  FormatQuote,
  HorizontalRule,
  Code,
  Terminal,
  FormatAlignLeft,
  FormatAlignCenter,
  FormatAlignRight,
  FormatAlignJustify,
  Highlight as HighlightIcon,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Checklist,
  ExpandMore,
  Link as LinkIcon,
  LinkOff,
} from "@mui/icons-material";

// Tiptap Imports
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import TypographyExtension from "@tiptap/extension-typography";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { TaskList } from "@tiptap/extension-list";
import { TaskItem } from "@tiptap/extension-list";
import LinkExtension from "@tiptap/extension-link";

// --- Menu Bar Component ---
const MenuBar = ({ editor, isDarkMode }) => {
  if (!editor) return null;

  const [anchorEl, setAnchorEl] = useState(null);
  const openHeadingMenu = Boolean(anchorEl);

  const handleHeadingClick = (event) => {
    event.preventDefault();
    setAnchorEl(event.currentTarget);
  };

  const handleHeadingClose = () => {
    setAnchorEl(null);
  };

  const setHeading = (level) => {
    if (level === 0) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().toggleHeading({ level }).run();
    }
    handleHeadingClose();
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl);

    if (url === null) return;

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const btnStyle = (isActive) => ({
    color: isActive ? "primary.main" : "text.secondary",
    bgcolor: isActive
      ? isDarkMode
        ? "rgba(19, 127, 236, 0.2)"
        : "#e0f2fe"
      : "transparent",
    borderRadius: 1,
    "&:hover": {
      bgcolor: isActive
        ? isDarkMode
          ? "rgba(19, 127, 236, 0.3)"
          : "#bae6fd"
        : isDarkMode
          ? "rgba(255,255,255,0.05)"
          : "#f1f5f9",
    },
  });

  return (
    <Box
      sx={{
        display: "flex",
        gap: 0.5,
        p: 1,
        borderBottom: `1px solid ${isDarkMode ? "#404040" : "#d4d4d4"}`,
        flexWrap: "wrap",
        bgcolor: isDarkMode ? "#1e293b" : "#f8fafc",
        alignItems: "center",
      }}
    >
      {/* History */}
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        sx={btnStyle(false)}
      >
        <Undo fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        sx={btnStyle(false)}
      >
        <Redo fontSize="small" />
      </IconButton>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

      {/* Headings Dropdown */}
      <Button
        size="small"
        onMouseDown={handleHeadingClick}
        endIcon={<ExpandMore fontSize="small" />}
        sx={{
          color: "text.secondary",
          textTransform: "none",
          minWidth: "auto",
          px: 1,
          ...btnStyle(editor.isActive("heading")),
        }}
      >
        {editor.isActive("heading", { level: 1 })
          ? "H1"
          : editor.isActive("heading", { level: 2 })
            ? "H2"
            : editor.isActive("heading", { level: 3 })
              ? "H3"
              : editor.isActive("heading", { level: 4 })
                ? "H4"
                : editor.isActive("heading", { level: 5 })
                  ? "H5"
                  : editor.isActive("heading", { level: 6 })
                    ? "H6"
                    : "Text"}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={openHeadingMenu}
        onClose={handleHeadingClose}
        MenuListProps={{
          "aria-labelledby": "heading-button",
          dense: true,
        }}
      >
        <MenuItem onClick={() => setHeading(0)}>
          <ListItemText>Paragraph</ListItemText>
        </MenuItem>
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <MenuItem key={level} onClick={() => setHeading(level)}>
            <ListItemText
              primaryTypographyProps={{
                fontWeight: level <= 2 ? 700 : 600,
                fontSize: `${1.3 - level * 0.1}rem`,
              }}
            >
              Heading {level}
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

      {/* Inline Formatting */}
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBold().run()}
        sx={btnStyle(editor.isActive("bold"))}
      >
        <FormatBold fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        sx={btnStyle(editor.isActive("italic"))}
      >
        <FormatItalic fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        sx={btnStyle(editor.isActive("strike"))}
      >
        <FormatStrikethrough fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        sx={btnStyle(editor.isActive("highlight"))}
      >
        <HighlightIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleCode().run()}
        sx={btnStyle(editor.isActive("code"))}
      >
        <Code fontSize="small" />
      </IconButton>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

      {/* Link */}
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={setLink}
        sx={btnStyle(editor.isActive("link"))}
      >
        <LinkIcon fontSize="small" />
      </IconButton>
      {editor.isActive("link") && (
        <IconButton
          size="small"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().unsetLink().run()}
          sx={btnStyle(false)}
        >
          <LinkOff fontSize="small" />
        </IconButton>
      )}

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

      {/* Scripting */}
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
        sx={btnStyle(editor.isActive("subscript"))}
      >
        <SubscriptIcon fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
        sx={btnStyle(editor.isActive("superscript"))}
      >
        <SuperscriptIcon fontSize="small" />
      </IconButton>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

      {/* Alignment */}
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        sx={btnStyle(editor.isActive({ textAlign: "left" }))}
      >
        <FormatAlignLeft fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        sx={btnStyle(editor.isActive({ textAlign: "center" }))}
      >
        <FormatAlignCenter fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        sx={btnStyle(editor.isActive({ textAlign: "right" }))}
      >
        <FormatAlignRight fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        sx={btnStyle(editor.isActive({ textAlign: "justify" }))}
      >
        <FormatAlignJustify fontSize="small" />
      </IconButton>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

      {/* Lists */}
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        sx={btnStyle(editor.isActive("bulletList"))}
      >
        <FormatListBulleted fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        sx={btnStyle(editor.isActive("orderedList"))}
      >
        <FormatListNumbered fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        sx={btnStyle(editor.isActive("taskList"))}
      >
        <Checklist fontSize="small" />
      </IconButton>

      <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />

      {/* Block Formats */}
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        sx={btnStyle(editor.isActive("blockquote"))}
      >
        <FormatQuote fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        sx={btnStyle(editor.isActive("codeBlock"))}
      >
        <Terminal fontSize="small" />
      </IconButton>
      <IconButton
        size="small"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        sx={btnStyle(false)}
      >
        <HorizontalRule fontSize="small" />
      </IconButton>
    </Box>
  );
};

// --- Main Editor Component ---
const RichTextEditor = ({
  value,
  onChange,
  isDarkMode,
  minHeight = "150px",
}) => {
  const [tick, setTick] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      TypographyExtension,
      Superscript,
      Subscript,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
      }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onTransaction: () => {
      // Force re-render to update menu bar button states
      setTick((t) => t + 1);
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      const currentHtml = editor.getHTML();
      // Prevent loops with empty content normalization
      if ((value === "" || value === "<p></p>") && currentHtml === "<p></p>") {
        return;
      }
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  return (
    <Box
      sx={{
        border: `1px solid ${isDarkMode ? "#404040" : "#d4d4d4"}`,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: isDarkMode ? "#262626" : "#ffffff",
        transition: "border-color 0.2s, box-shadow 0.2s",
        "&:focus-within": {
          borderColor: "#137fec",
          boxShadow: `0 0 0 1px #137fec`,
        },
        "& .ProseMirror": {
          p: 2.5,
          minHeight: minHeight,
          height: "auto",
          outline: "none",
          color: isDarkMode ? "#ffffff" : "#111418",
          typography: "body1",
          "& p": { m: 0, mb: 1.5, lineHeight: 1.6 },
          "& ul, & ol": { m: 0, mb: 1.5, pl: 3 },
          "& ul": { listStyleType: "disc" },
          "& ol": { listStyleType: "decimal" },
          "& ul[data-type='taskList']": {
            listStyle: "none",
            pl: 0,
            "& li": {
              display: "flex",
              alignItems: "center",
              "& > label": { mr: 1, display: "flex", mt: 0.5 },
              "& > div": { flex: 1 },
            },
          },
          "& h1": {
            fontSize: "1.5rem",
            fontWeight: 700,
            mt: 2,
            mb: 1,
            lineHeight: 1.2,
          },
          "& h2": {
            fontSize: "1.25rem",
            fontWeight: 600,
            mt: 2,
            mb: 1,
            lineHeight: 1.2,
          },
          "& h3": {
            fontSize: "1.1rem",
            fontWeight: 600,
            mt: 2,
            mb: 1,
            lineHeight: 1.2,
          },
          "& h4": {
            fontSize: "1rem",
            fontWeight: 600,
            mt: 2,
            mb: 1,
            lineHeight: 1.2,
          },
          "& h5": {
            fontSize: "0.9rem",
            fontWeight: 600,
            mt: 2,
            mb: 1,
            lineHeight: 1.2,
          },
          "& h6": {
            fontSize: "0.8rem",
            fontWeight: 600,
            mt: 2,
            mb: 1,
            lineHeight: 1.2,
          },
          "& strong": { fontWeight: 700 },
          "& em": { fontStyle: "italic" },
          "& mark": {
            backgroundColor: isDarkMode ? "rgba(250, 204, 21, 0.4)" : "#fef08a",
            color: isDarkMode ? "#fde047" : "inherit",
            padding: "0.1rem 0.2rem",
            borderRadius: "0.25rem",
          },
          "& blockquote": {
            borderLeft: `3px solid ${isDarkMode ? "#475569" : "#cbd5e1"}`,
            pl: 2,
            ml: 0,
            my: 1.5,
            fontStyle: "italic",
            color: "text.secondary",
          },
          "& code": {
            bgcolor: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
            p: "0.2rem 0.4rem",
            borderRadius: 1,
            fontFamily: "monospace",
            fontSize: "0.875em",
          },
          "& pre": {
            bgcolor: isDarkMode ? "#1e293b" : "#f1f5f9",
            p: 2,
            borderRadius: 2,
            overflowX: "auto",
            fontFamily: "monospace",
            my: 1.5,
            "& code": { bgcolor: "transparent", p: 0, color: "inherit" },
          },
          "& a": {
            color: "#137fec",
            textDecoration: "underline",
            cursor: "pointer",
          },
          "& hr": {
            border: "none",
            borderTop: `1px solid ${isDarkMode ? "#404040" : "#d4d4d4"}`,
            my: 3,
          },
        },
      }}
    >
      <MenuBar editor={editor} isDarkMode={isDarkMode} />
      <EditorContent editor={editor} />
    </Box>
  );
};

export default RichTextEditor;
