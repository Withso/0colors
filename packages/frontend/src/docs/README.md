# Color Node Design System - Documentation

## 📚 Documentation Overview

This documentation provides comprehensive information about the color node design token system, including architecture, features, implementation status, and development guidelines.

## 📖 Documentation Files

### Core System Documentation

1. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System Architecture
   - Overview and tech stack
   - Core data models (ColorNode, DesignToken, TokenGroup, etc.)
   - Application structure and components
   - State flow and management
   - LocalStorage schema
   - Future architecture considerations

2. **[COLOR-NODES.md](./COLOR-NODES.md)** - Color Nodes System
   - Node types and color spaces (HSL, RGB, OKLCH, HEX)
   - Node properties and hierarchy
   - Node creation and display
   - Positioning and collision detection
   - Selection and operations
   - Color space conversion

3. **[LOCK-AND-DIFF.md](./LOCK-AND-DIFF.md)** - Lock and Diff System
   - Lock system (prevents inheritance)
   - Diff system (offset-based inheritance)
   - Offset properties and calculation
   - Lock and diff interaction matrix
   - UI components and controls
   - Implementation guidelines and test scenarios

4. **[TOKEN-SYSTEM.md](./TOKEN-SYSTEM.md)** - Token System
   - Token structure and types
   - Token panel layout and display
   - Token operations (create, update, delete, assign)
   - Token groups and organization
   - Token search and filtering
   - Export/import functionality
   - Multi-project and multi-page support

5. **[PALETTE-SYSTEM.md](./PALETTE-SYSTEM.md)** - Palette System
   - Palette nodes and properties
   - Palette UI and controls
   - Shade generation (linear and curve modes)
   - Lightness calculation algorithms
   - Token generation and naming patterns
   - Palette updates and synchronization
   - Use cases and best practices

6. **[CANVAS-SYSTEM.md](./CANVAS-SYSTEM.md)** - Canvas System
   - Pan and zoom controls
   - Canvas state persistence
   - Node selection (single and multi)
   - Node dragging and positioning
   - Connection wires and drag interactions
   - Collision detection and resolution
   - Keyboard shortcuts and performance

7. **[IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)** - Implementation Status ⭐
   - **START HERE for development work**
   - What's fully implemented and working
   - What's partially implemented
   - What's not implemented (critical missing features)
   - Known bugs and issues
   - Development priorities
   - Testing checklist
   - Next steps for implementation

### Code Export Documentation

8. **[FIGMA-VARIABLES-FORMAT.md](./FIGMA-VARIABLES-FORMAT.md)** - Figma Variables Export Format
   - DTCG-compliant format specification
   - Token types (color, dimension, number)
   - Nested token structure and organization
   - Color space conversion (HSL to RGB)
   - Figma extensions (variableId, scopes, modeName)
   - Import process and step-by-step guide
   - Example exports and validation
   - Troubleshooting common issues

9. **[code-export-empty-tokens.md](./code-export-empty-tokens.md)** - Empty Token Filtering Logic
   - Why empty tokens are filtered
   - Empty token detection logic by type
   - Implementation details and validation
   - User interface feedback
   - Example scenarios and workflow
   - Benefits and error prevention

## 🚀 Quick Start for Developers

### Understanding the System

1. **Start with [ARCHITECTURE.md](./ARCHITECTURE.md)** to understand the overall system structure
2. **Read [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)** to know what's working and what needs work
3. **Refer to specific docs** (COLOR-NODES, LOCK-AND-DIFF, etc.) as needed for detailed information

### Key Concepts

**Parent-Child Inheritance**: Child nodes inherit color values from parent nodes based on lock and diff states.

**Lock System**: Prevents a property from inheriting changes from the parent.

**Diff System**: Controls whether a property maintains an offset from parent (diff enabled) or matches parent exactly (diff disabled).

**Offset-Based Inheritance**: The core concept where `child value = parent value + offset` when diff is enabled.

**Palette System**: Automatically generates multiple color shades from a base color.

**Token System**: Figma-like design tokens that can be assigned to nodes and organized in groups.

### Critical Missing Feature

**⚠️ The offset-based diff inheritance system is NOT fully implemented.**

When a parent node's color changes:
- ❌ Children do not automatically update
- ❌ Diff state is not applied (offsets ignored)
- ❌ Lock state is not respected

**This is the #1 priority to implement.** See [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) for detailed implementation guide.

## 🛠️ Development Workflow

### To Implement a Feature

1. **Check [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)** to see if it's already tracked
2. **Read the relevant documentation** to understand the expected behavior
3. **Follow the implementation guide** provided in the docs
4. **Test thoroughly** using the test scenarios in IMPLEMENTATION-STATUS.md
5. **Update the documentation** if you change behavior or add features

### To Fix a Bug

1. **Check [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)** "Known Issues" section
2. **Reproduce the bug** following the steps
3. **Read the relevant documentation** to understand expected behavior
4. **Implement the fix** based on the documented expected behavior
5. **Test the fix** thoroughly
6. **Update IMPLEMENTATION-STATUS.md** to mark the bug as fixed

### To Add a New Feature

1. **Review [ARCHITECTURE.md](./ARCHITECTURE.md)** to ensure it fits the system design
2. **Design the feature** considering the existing patterns
3. **Implement the feature** following the coding style
4. **Add tests** to verify it works
5. **Update documentation** to include the new feature

## 📁 File Structure

```
/
├── App.tsx                          # Main application entry point
├── components/
│   ├── ColorCanvas.tsx              # Infinite zoomable canvas
│   ├── ColorNodeCard.tsx            # Individual color node UI
│   ├── TokensPanel.tsx              # Token management panel
│   ├── ModeSidebar.tsx              # Mode selector sidebar
│   ├── PaletteShadesGrid.tsx        # Palette shades grid view
│   ├── SpacingNodeCard.tsx          # Spacing value node UI
│   ├── ScrubberInput.tsx            # Scrubber input component
│   ├── ProjectsPage.tsx             # Projects overview page
│   └── types.ts                     # TypeScript type definitions
├── docs/
│   ├── README.md                    # This file
│   ├── ARCHITECTURE.md              # System architecture
│   ├── COLOR-NODES.md               # Color nodes documentation
│   ├── LOCK-AND-DIFF.md             # Lock and diff system
│   ├── TOKEN-SYSTEM.md              # Token system
│   ├── PALETTE-SYSTEM.md            # Palette system
│   ├── CANVAS-SYSTEM.md             # Canvas system
│   └── IMPLEMENTATION-STATUS.md     # Implementation status
└── styles/
    └── globals.css                  # Global styles
```

## 🎯 Current Development Focus

### Priority 1: Critical Features (Implement First) 🔥

1. **Parent-child offset-based inheritance** 
   - File: `/App.tsx` - `updateNode()` function
   - When parent color changes, update all children based on lock/diff state
   - See detailed implementation in [LOCK-AND-DIFF.md](./LOCK-AND-DIFF.md)

2. **Offset calculation in ColorNodeCard**
   - File: `/components/ColorNodeCard.tsx` - All slider handlers
   - When child slider changes with diff enabled, recalculate offset
   - Formula: `offset = child value - parent value`

3. **Palette base color propagation**
   - File: `/App.tsx` - `updateNode()` function
   - When palette node color changes, update all shade children
   - Maintain lightness distribution, update hue/saturation/alpha

### Priority 2: Important Features (Implement Second)

4. **Multi-level hierarchy propagation**
   - Support grandchildren inheriting from grandparents
   - Recursive or iterative update approach

5. **Palette token name sync**
   - When palette name changes, update all shade token names
   - Update palette entry group name

6. **Comprehensive testing**
   - Run through all test scenarios in IMPLEMENTATION-STATUS.md
   - Test all color spaces
   - Test multi-level hierarchies

### Priority 3: Enhancements (Future)

7. **Canvas improvements** (grid snapping, minimap, zoom controls)
8. **Keyboard shortcuts** (select all, delete, duplicate, undo/redo)
9. **Theme system** (multiple themes with shared structure)
10. **Advanced palette features** (hue/saturation shifting)

## 🧪 Testing

### Test Scenarios

See [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) for comprehensive test scenarios.

**Quick Test**:
1. Create parent node (hue = 0)
2. Create child node
3. Adjust child hue to 25
4. Enable diff for hue
5. Change parent hue to 50
6. **Expected**: Child hue = 75 (50 + 25)
7. **Actual (current)**: Child hue = 0 (no update) ❌

### Running Tests

Currently no automated tests. All testing is manual through UI.

**Future**: Add unit tests for:
- Color space conversions
- Offset calculations
- Inheritance logic
- Collision detection

## 🐛 Reporting Issues

If you discover a bug:

1. **Check [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md)** to see if it's already known
2. **Document the issue**:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots if applicable
3. **Add to "Known Issues"** section in IMPLEMENTATION-STATUS.md
4. **Assign severity**: Critical, Medium, or Low

## 💡 Contributing

### Code Style

- Use TypeScript for type safety
- Use functional components with hooks
- Use `useCallback` for functions passed as props
- Use descriptive variable names
- Comment complex logic
- Follow existing patterns in the codebase

### Documentation Style

- Use clear, concise language
- Include code examples
- Provide visual diagrams where helpful
- Keep documentation in sync with code
- Update IMPLEMENTATION-STATUS.md when features are completed

### Commit Messages

- Use descriptive commit messages
- Reference documentation sections when relevant
- Example: "Implement parent-child inheritance (LOCK-AND-DIFF.md)"

## 🔗 Related Resources

### Libraries Used

- **React** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **color-namer** - Auto-generate color names
- **Custom UI components** - In `/components/ui/`

### External Documentation

- [Tailwind CSS](https://tailwindcss.com/)
- [React Hooks](https://react.dev/reference/react)
- [TypeScript](https://www.typescriptlang.org/)
- [OKLCH Color Space](https://oklch.com/)

## ❓ FAQ

### Q: Why is offset-based inheritance not working?
A: It's not implemented yet. See [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) for details and implementation guide.

### Q: How do I add a new color space?
A: See [COLOR-NODES.md](./COLOR-NODES.md) "Color Spaces" section and follow the pattern used for HSL, RGB, OKLCH, and HEX.

### Q: How do I create a new token type?
A: See [TOKEN-SYSTEM.md](./TOKEN-SYSTEM.md) "Token Types" section. Add new type to `TokenType` enum and implement display logic.

### Q: How does the theme system work?
A: It doesn't exist yet. It's a planned feature. See [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) "To Be Implemented" section.

### Q: Why don't palette shades update when I change the base color?
A: This is a known bug. See [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) "Bugs to Fix" section.

### Q: How do I test the system?
A: Follow the test scenarios in [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) "Testing Checklist" section.

### Q: Where should I start if I want to contribute?
A: Start with [IMPLEMENTATION-STATUS.md](./IMPLEMENTATION-STATUS.md) "Priority 1" items - the critical missing features that need implementation.

---

## 📞 Contact

For questions or issues with the documentation, please refer to the relevant documentation file or create an issue in the project repository.

---

**Last Updated**: Based on latest codebase state before offset-based diff restoration

**Documentation Version**: 1.0

**Status**: Complete and ready for development