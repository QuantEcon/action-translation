# Using Different Claude Models

The `claude-model` parameter allows you to specify which Claude model to use for translations.

## Default Model

By default, the action uses **`claude-sonnet-4-6`** (Claude Sonnet 4.6).

No configuration needed - it just works!

```yaml
- uses: quantecon/action-translation@v0.7
  with:
    mode: sync
    target-repo: 'quantecon/lecture-python.zh-cn'
    target-language: 'zh-cn'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    # claude-model: 'claude-sonnet-4-6'  # This is the default
```

## Using a Different Model

You can specify a different Claude model using the `claude-model` parameter:

```yaml
- uses: quantecon/action-translation@v0.7
  with:
    mode: sync
    target-repo: 'quantecon/lecture-python.zh-cn'
    target-language: 'zh-cn'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    claude-model: 'claude-opus-4-20250514'  # Use a different model
```

## Available Models

Check Anthropic's documentation for available models:
https://docs.anthropic.com/en/docs/about-claude/models

Common options:
- `claude-sonnet-4-6` - **Recommended** (latest Sonnet, balanced speed/quality)
- `claude-opus-4-6` - Highest quality (slower, more expensive)
- `claude-haiku-4-5-20251001` - Fastest (lower quality, cheaper)
- `claude-sonnet-4-5-20250929` - Previous Sonnet 4.5 version

## When to Change Models

### Use Claude Opus
- **Highest quality needed**: Critical translations, technical documentation
- **Complex content**: Heavy use of domain-specific terminology
- **Cost is not a concern**: Willing to pay more for best results

### Use Claude Haiku
- **Speed is critical**: Large volumes of content
- **Simple content**: Straightforward text without technical terms
- **Cost optimization**: Budget-conscious translations

### Use Claude Sonnet (Default)
- **Balanced approach**: Good quality at reasonable cost
- **Most use cases**: General documentation translation
- **Recommended**: Unless you have specific requirements

## Testing Different Models

You can test different models on the same content to compare quality:

```yaml
# Test workflow 1: Using Sonnet
- uses: quantecon/action-translation@v0.7
  with:
    mode: sync
    claude-model: 'claude-sonnet-4-20250514'
    # ... other parameters

# Test workflow 2: Using Opus
- uses: quantecon/action-translation@v0.7
  with:
    mode: sync
    claude-model: 'claude-opus-4-20250514'
    # ... other parameters
```

## Cost Comparison

Approximate costs per 1M tokens (as of March 2026):

| Model | Input | Output | Use Case |
|-------|-------|--------|----------|
| Haiku 4.5 | $1.00 | $5.00 | Fast, simple content |
| Sonnet 4.6 | $3.00 | $15.00 | **Recommended** - balanced |
| Opus 4.6 | $5.00 | $25.00 | Highest quality |

*See https://www.anthropic.com/pricing for current pricing*

## Example: Upgrading Model Version

When Anthropic releases a new model version:

```yaml
# Old version
claude-model: 'claude-sonnet-4-20250514'

# New version (when released)
claude-model: 'claude-sonnet-4-20251030'  # Example future version
```

## Troubleshooting

### Model Not Found Error

```
404 {"type":"error","error":{"type":"not_found_error","message":"model: claude-sonnet-4.5-20241022"}}
```

**Solution**: Check the model name is correct. Common mistakes:
- ❌ `claude-sonnet-4.5-20241022` (doesn't exist)
- ✅ `claude-sonnet-4-20250514` (correct)

### Model Deprecation

If Anthropic deprecates a model:
1. Check deprecation notice in logs
2. Update `claude-model` to newer version
3. Test translations with new model
4. Update workflow

## Best Practices

1. **Start with Sonnet** - Good balance for most use cases
2. **Test before switching** - Compare quality on sample content
3. **Monitor costs** - Check Anthropic console after model changes
4. **Update gradually** - Test new models before rolling out
5. **Document your choice** - Note why you chose a specific model

## Future Models

This parameter makes the action future-proof:
- New Claude models can be used immediately
- No code changes required
- Just update the workflow parameter

---

**Recommendation**: Stick with the default `claude-sonnet-4-6` unless you have specific requirements.
