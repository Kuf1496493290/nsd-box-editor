import type { BoolLabelMode, IfNode, NsdNode, StyleConfig } from '../app/types'

interface PropertyPanelProps {
    style: StyleConfig
    selectedNode: NsdNode | null
    onChange: (patch: Partial<StyleConfig>) => void
    onChangeIfBoolLabelMode: (mode: BoolLabelMode) => void
}

function isIfNode(node: NsdNode | null): node is IfNode {
    return node !== null && node.type === 'if'
}

export function PropertyPanel(props: Readonly<PropertyPanelProps>) {
    const { style, selectedNode, onChange, onChangeIfBoolLabelMode } = props

    const showIf = isIfNode(selectedNode)

    return (
        <div>
            <div className="field">
                <div className="label">矩形内边距</div>
                <div className="sliderRow">
                    <input
                        type="range"
                        min={6}
                        max={30}
                        value={style.paddingProcess}
                        onChange={(e) => onChange({ paddingProcess: Number(e.target.value) })}
                    />
                    <div className="value">{style.paddingProcess}</div>
                </div>
            </div>

            <div className="field">
                <div className="label">头部内边距（IF/CASE/循环条件栏）</div>
                <div className="sliderRow">
                    <input
                        type="range"
                        min={6}
                        max={30}
                        value={style.paddingHeader}
                        onChange={(e) => onChange({ paddingHeader: Number(e.target.value) })}
                    />
                    <div className="value">{style.paddingHeader}</div>
                </div>
            </div>

            <div className="field">
                <div className="label">分支标签内边距（T/F 或 Y/N）</div>
                <div className="sliderRow">
                    <input
                        type="range"
                        min={4}
                        max={24}
                        value={style.paddingBranchLabel}
                        onChange={(e) => onChange({ paddingBranchLabel: Number(e.target.value) })}
                    />
                    <div className="value">{style.paddingBranchLabel}</div>
                </div>
            </div>

            {showIf ? (
                <div className="field">
                    <div className="label">IF 分支标签模式（左真右假固定）</div>
                    <div className="sliderRow" style={{ alignItems: 'center', gap: 10 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                                type="radio"
                                name="ifLabelMode"
                                value="TF"
                                checked={selectedNode.boolLabelMode === 'TF'}
                                onChange={() => onChangeIfBoolLabelMode('TF')}
                            />
                            <span>T / F</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                                type="radio"
                                name="ifLabelMode"
                                value="YN"
                                checked={selectedNode.boolLabelMode === 'YN'}
                                onChange={() => onChangeIfBoolLabelMode('YN')}
                            />
                            <span>Y / N</span>
                        </label>
                    </div>
                </div>
            ) : null}

            <div className="hint">
                说明：颜色固定黑色，尺寸自动布局。这里只提供全局内边距调节（同类型统一）。
            </div>
        </div>
    )
}