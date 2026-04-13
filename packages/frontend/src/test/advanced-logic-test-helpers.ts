import type {
  CanvasState,
  ChannelLogic,
  ColorNode,
  ConditionRow,
  DesignToken,
  ExpressionToken,
  NodeAdvancedLogic,
  Page,
  Theme,
  TokenAssignmentLogic,
  TokenProject,
} from '../types';

export function makeExpressionToken(token: Partial<ExpressionToken> & Pick<ExpressionToken, 'type' | 'value'>): ExpressionToken {
  return {
    id: token.id || `${token.type}-${token.value}-${Math.random().toString(36).slice(2, 8)}`,
    ...token,
  };
}

export function literal(value: number | string): ExpressionToken {
  return makeExpressionToken({ type: 'literal', value: String(value) });
}

export function operator(value: string): ExpressionToken {
  return makeExpressionToken({ type: 'operator', value, displayLabel: value });
}

export function keyword(value: string): ExpressionToken {
  return makeExpressionToken({ type: 'keyword', value, displayLabel: value });
}

export function booleanToken(value: boolean): ExpressionToken {
  return makeExpressionToken({ type: 'boolean', value: value ? 'true' : 'false', displayLabel: value ? 'true' : 'false' });
}

export function localRef(name: string): ExpressionToken {
  return makeExpressionToken({ type: 'local', value: name, displayLabel: `$${name}` });
}

export function selfRef(property: string): ExpressionToken[] {
  return [
    makeExpressionToken({ type: 'reference', value: '@Self', displayLabel: '@Self' }),
    makeExpressionToken({ type: 'property', value: `.${property}`, displayLabel: `.${property}`, refProperty: property }),
  ];
}

export function parentRef(property: string): ExpressionToken[] {
  return [
    makeExpressionToken({ type: 'reference', value: '@Parent', displayLabel: '@Parent' }),
    makeExpressionToken({ type: 'property', value: `.${property}`, displayLabel: `.${property}`, refProperty: property }),
  ];
}

export function tokenRef(name: string, tokenId = ''): ExpressionToken {
  return makeExpressionToken({
    type: 'tokenRef',
    value: `{${name}}`,
    displayLabel: `{${name}}`,
    refTokenId: tokenId,
  });
}

export function nodeRef(nodeName: string, property: string, nodeId = ''): ExpressionToken[] {
  return [
    makeExpressionToken({ type: 'reference', value: nodeName, displayLabel: nodeName, refNodeId: nodeId }),
    makeExpressionToken({ type: 'property', value: `.${property}`, displayLabel: `.${property}`, refProperty: property }),
  ];
}

export function row(tokens: ExpressionToken[], outputName = 'out_1', enabled = true): ConditionRow {
  return {
    id: `row-${outputName}-${Math.random().toString(36).slice(2, 8)}`,
    tokens,
    enabled,
    outputName,
  };
}

export function channelLogic(rows: ConditionRow[], overrides: Partial<ChannelLogic> = {}): ChannelLogic {
  return {
    rows,
    fallbackMode: 'default',
    ...overrides,
  };
}

export function tokenAssignment(rows: ConditionRow[], overrides: Partial<TokenAssignmentLogic> = {}): TokenAssignmentLogic {
  return {
    rows,
    fallbackMode: 'default',
    ...overrides,
  };
}

export function createColorNode(overrides: Partial<ColorNode> = {}): ColorNode {
  return {
    id: 'node-1',
    colorSpace: 'hsl',
    hue: 0,
    saturation: 0,
    lightness: 50,
    alpha: 100,
    position: { x: 0, y: 0 },
    parentId: null,
    hueOffset: 0,
    saturationOffset: 0,
    lightnessOffset: 0,
    alphaOffset: 0,
    tokenId: null,
    projectId: 'project-1',
    pageId: 'page-1',
    ...overrides,
  };
}

export function createDesignToken(overrides: Partial<DesignToken> = {}): DesignToken {
  return {
    id: 'token-1',
    name: 'Token 1',
    type: 'color',
    groupId: null,
    projectId: 'project-1',
    pageId: 'page-1',
    hue: 210,
    saturation: 80,
    lightness: 50,
    alpha: 100,
    themeValues: {
      'theme-1': {
        hue: 210,
        saturation: 80,
        lightness: 50,
        alpha: 100,
      },
    },
    ...overrides,
  };
}

export function createProject(overrides: Partial<TokenProject> = {}): TokenProject {
  return {
    id: 'project-1',
    name: 'QA Project',
    isExpanded: true,
    folderColor: 210,
    ...overrides,
  };
}

export function createPage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    name: 'Page 1',
    projectId: 'project-1',
    createdAt: 1,
    ...overrides,
  };
}

export function createTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 'theme-1',
    name: 'Primary',
    projectId: 'project-1',
    createdAt: 1,
    isPrimary: true,
    ...overrides,
  };
}

export function createCanvasState(overrides: Partial<CanvasState> = {}): CanvasState {
  return {
    projectId: 'project-1',
    pageId: 'page-1',
    pan: { x: 0, y: 0 },
    zoom: 1,
    ...overrides,
  };
}

export function createNodeAdvancedLogic(overrides: Partial<NodeAdvancedLogic> = {}): NodeAdvancedLogic {
  return {
    nodeId: 'node-1',
    channels: {},
    ...overrides,
  };
}
