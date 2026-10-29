import React, { useCallback, useMemo } from 'react';
import { DisclosureRow, IconThinkOutlineRegular, JsonBlock, MarkdownText, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives';

// DSH 0.2.1-rc.2: the Chat owner supplies useDisclosure/useGroupAction/useTurnData.
// Factory occurrences are public and do not claim the built-in entry's children.
const NODE_SLOT = 'conversation.chat.node';
const ASSISTANT_KEY = 'assistant-step';
const FALLBACK_POLICY = Object.freeze({ settledReasoningPreview: false });
const FALLBACK_PRESENTATION = Object.freeze({
  getSnapshot: () => FALLBACK_POLICY,
  subscribe: () => () => {},
});
const FALLBACK_LABELS = Object.freeze({
  code: { copyLabel: '复制代码', copiedLabel: '已复制' },
  footnotes: '参考资料',
});
const THINK_ICON = <IconThinkOutlineRegular size={14}/>;

/** Match the native preview: a streaming paragraph is previewed only after its first newline. */
function reasoningPreview(text, running) {
  if (!running) return text.split('\n', 1)[0].replaceAll('**', '');
  let firstLinePending = true;
  let latest = '';
  const lines = text.split('\n');
  // The final fragment may be incomplete and therefore is not a preview candidate.
  for (let index = 0; index < lines.length - 1; index++) {
    const line = lines[index].trim();
    if (!line) firstLinePending = true;
    else if (firstLinePending) { latest = line; firstLinePending = false; }
  }
  return latest.replaceAll('**', '');
}

function Reasoning({ text, running, hidden, reveal, useDisclosure, useGroupAction, usePresentation, renderFactorySlot, t }) {
  const { expanded, toggle } = useDisclosure();
  const ref = useGroupAction(hidden, reveal);
  const summary = useMemo(() => reasoningPreview(text, running), [text, running]);
  const preview = usePresentation(policy => !expanded && summary !== '' && (running || policy.settledReasoningPreview));
  return <div ref={ref} data-turn-process-inline={hidden || undefined} className="diui-reasoning">
    <DisclosureRow icon={THINK_ICON} title={t('message.think')} running={running}
      open={expanded} expandable expandOnRowClick onToggle={toggle}
      collapsedContent={preview ? <span className="diui-reasoning-preview"><TextShimmer>{summary}</TextShimmer></span> : undefined}>
      {expanded && <div className="diui-reasoning-body">{renderFactorySlot('conversation.chat.reasoning.content', { text, running }, {
        fallback: <MarkdownText text={text} streaming={running} labels={FALLBACK_LABELS} variant="compact"/>,
      })}</div>}
    </DisclosureRow>
  </div>;
}

function AssistantNode({ node, sessionId, groupPart, useDisclosure, useGroupAction, useTurnData, turnProcess,
  openFile, loadImage, fileMentions, usePresentation, renderFactorySlot, t, RichAnswer, Attachment, ImageActions }) {
  const data = node.data;
  const blocks = data.blocks;
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
  const tail = useTurnData('turn-tail');
  // Match the closing sequence exactly: an older assistant step is not entitled
  // to the final reply's file-mention vocabulary, even inside a closed Turn.
  const mentionOwner = useMemo(() => {
    if (turn?.status !== 'closed' || data.finalNode === undefined) return undefined;
    if (tail?.closing?.finalNode.seq !== data.finalNode.seq) return undefined;
    return { turn, seq: data.finalNode.seq, openFile };
  }, [turn, data.finalNode, tail, openFile]);
  const mentions = useMemo(() => mentionOwner === undefined ? undefined : fileMentions(mentionOwner), [mentionOwner, fileMentions]);
  const reasoningHidden = turnProcess !== undefined && turnProcess.foldable && turnProcess.spec.answerStep === data.step
    && turnProcess.spec.inlineReasoning && !turnProcess.open;
  const reveal = useCallback(() => { turnProcess?.setOpen(true); }, [turnProcess]);
  const streaming = data.status === 'running';
  const interrupted = data.status === 'interrupted';

  if (!(streaming || interrupted || blocks.some(block => block.kind !== 'tool-call'))) return null;
  const rendered = [];
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (!block) continue;
    if (groupPart === 'reasoning' && block.kind !== 'reasoning') continue;
    if (groupPart === 'response' && block.kind === 'reasoning') continue;
    switch (block.kind) {
      case 'text':
        rendered.push(<RichAnswer key={index} text={block.text} streaming={streaming} fileMentions={mentions}
          scopeKey={JSON.stringify([sessionId ?? '', node.key, index])}/>);
        break;
      case 'reasoning':
        if (!block.text.trim()) break;
        rendered.push(<Reasoning key={index} text={block.text} running={streaming && index === blocks.length - 1}
          hidden={reasoningHidden} reveal={reveal} useDisclosure={useDisclosure} useGroupAction={useGroupAction}
          usePresentation={usePresentation} renderFactorySlot={renderFactorySlot} t={t}/>);
        break;
      case 'image': {
        const start = index;
        const images = [{ attachment: block.attachment }];
        while (index + 1 < blocks.length && blocks[index + 1]?.kind === 'image') {
          images.push({ attachment: blocks[++index].attachment });
        }
        rendered.push(<React.Fragment key={start}>{renderFactorySlot('conversation.images.content', { images, loadImage, align: 'start' }, {
          fallback: <div className="diui-image-attachments">{images.map(({ attachment }, imageIndex) =>
            <Attachment key={imageIndex} attachment={attachment} loadImage={loadImage}/>)}</div>,
        })}</React.Fragment>);
        break;
      }
      case 'tool-call': break; // Tool-call nodes remain owned by Chat.
      default:
        rendered.push(<JsonBlock key={index} label={t('message.unknownBlock')} payload={block.block}
          truncatedLabel={total => t('json.truncated', { total })}/>);
    }
  }
  const showStopped = interrupted && (groupPart === undefined || groupPart === 'response'
    || !blocks.some(block => block.kind !== 'reasoning' && block.kind !== 'tool-call'));
  return <div className="diui diui-inline" data-streaming={streaming || undefined} data-intelligent-ui="assistant">
    <ImageActions><div className="diui-assistant-body">{rendered}{showStopped && <span className="diui-stopped">{t('message.stopped')}</span>}</div></ImageActions>
  </div>;
}

/**
 * Shadow only the assistant body. The built-in entry remains registered at
 * priority 0; Cordis disposal restores it and the slot's own error boundary can
 * abdicate this entry if rendering fails. Deliberately no local error boundary.
 *
 * Native children are neither redeclared nor dispatched. Their official
 * content Factories retain reasoning Markdown and the authorized image gallery.
 */
export function registerAssistantNode(ctx, { RichAnswer, Attachment, ImageActions=React.Fragment }) {
  if (!RichAnswer || !Attachment) throw new TypeError('Assistant renderer requires RichAnswer and Attachment components');
  return ctx.slots.inject(NODE_SLOT, () => {
    const nativeEntry = ctx.slots.entries(NODE_SLOT).find(entry => entry.options.key === ASSISTANT_KEY
      && (entry.options.priority ?? 0) === 0);
    return ctx.slots.register({
      name: NODE_SLOT,
      key: ASSISTANT_KEY,
      priority: -20,
      locale: 'chat',
      inject: (...args) => {
        const face = nativeEntry?.inject?.(...args) ?? {};
        return { ...face, hooks: { ...face.hooks, presentation: face.hooks?.presentation ?? FALLBACK_PRESENTATION } };
      },
    }, props => <AssistantNode {...props} RichAnswer={RichAnswer} Attachment={Attachment} ImageActions={ImageActions}/>);
  });
}
