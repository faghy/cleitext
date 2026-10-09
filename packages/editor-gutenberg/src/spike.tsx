import {
  BlockEditorKeyboardShortcuts,
  BlockEditorProvider,
  BlockInspector,
  BlockList,
  BlockTools,
  ObserveTyping,
  WritingFlow,
} from '@wordpress/block-editor';
import { serialize, type Block as BlockInstance } from '@wordpress/blocks';
import { Popover, SlotFillProvider } from '@wordpress/components';
import { useState } from 'react';
import { registerCoreBlocks } from './register-blocks';
import './style.css';

registerCoreBlocks();

/** Feasibility spike: Gutenberg running outside WordPress (M2, first step). */
export function GutenbergSpike() {
  const [blocks, setBlocks] = useState<BlockInstance[]>([]);
  return (
    <SlotFillProvider>
      <BlockEditorProvider
        value={blocks}
        onInput={setBlocks}
        onChange={setBlocks}
        settings={{ hasFixedToolbar: false }}
      >
        <div style={{ display: 'flex', gap: 16 }}>
          <div
            className="editor-styles-wrapper"
            style={{ flex: 1, padding: 24, background: '#fff' }}
            data-testid="canvas"
          >
            <BlockEditorKeyboardShortcuts.Register />
            <BlockTools>
              <WritingFlow>
                <ObserveTyping>
                  <BlockList />
                </ObserveTyping>
              </WritingFlow>
            </BlockTools>
          </div>
          <aside style={{ width: 280, borderLeft: '1px solid #ddd' }}>
            <BlockInspector />
          </aside>
        </div>
        <Popover.Slot />
      </BlockEditorProvider>
      <pre data-testid="blocks-json" style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(
          blocks.map(({ name, attributes, innerBlocks }) => ({
            name,
            attributes,
            innerBlocks: innerBlocks.length,
          })),
          null,
          2,
        )}
      </pre>
      <pre data-testid="serialized" style={{ display: 'none' }}>
        {serialize(blocks)}
      </pre>
    </SlotFillProvider>
  );
}
