<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;

class NewsContentSanitizer
{
    private const ALLOWED_TAGS = [
        'a' => ['href', 'rel', 'target', 'title'],
        'b' => [],
        'blockquote' => [],
        'br' => [],
        'code' => [],
        'em' => [],
        'h2' => [],
        'h3' => [],
        'i' => [],
        'li' => [],
        'ol' => [],
        'p' => [],
        'pre' => [],
        'strong' => [],
        'ul' => [],
    ];

    private const DROP_WITH_CONTENT = [
        'audio',
        'button',
        'canvas',
        'embed',
        'form',
        'iframe',
        'img',
        'input',
        'link',
        'math',
        'meta',
        'object',
        'script',
        'select',
        'source',
        'style',
        'svg',
        'textarea',
        'video',
    ];

    public static function clean(?string $html): string
    {
        $html = trim((string) $html);

        if ($html === '') {
            return '';
        }

        $previous = libxml_use_internal_errors(true);
        $document = new DOMDocument('1.0', 'UTF-8');
        $loaded = $document->loadHTML(
            '<?xml encoding="utf-8" ?><div>' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (! $loaded || ! $document->documentElement) {
            return strip_tags($html, self::allowedTagString());
        }

        self::sanitizeNode($document->documentElement);

        $output = '';

        foreach ($document->documentElement->childNodes as $child) {
            $output .= $document->saveHTML($child);
        }

        return trim($output);
    }

    private static function sanitizeNode(DOMNode $node): void
    {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if (! $child instanceof DOMElement) {
                continue;
            }

            $tag = strtolower($child->tagName);

            if (in_array($tag, self::DROP_WITH_CONTENT, true)) {
                $child->parentNode?->removeChild($child);
                continue;
            }

            if (! array_key_exists($tag, self::ALLOWED_TAGS)) {
                self::sanitizeNode($child);
                self::unwrapNode($child);
                continue;
            }

            self::sanitizeElementAttributes($child, self::ALLOWED_TAGS[$tag]);
            self::sanitizeNode($child);
        }
    }

    /**
     * @param array<int, string> $allowedAttributes
     */
    private static function sanitizeElementAttributes(
        DOMElement $element,
        array $allowedAttributes,
    ): void {
        foreach (iterator_to_array($element->attributes) as $attribute) {
            $name = strtolower($attribute->name);

            if (! in_array($name, $allowedAttributes, true)) {
                $element->removeAttributeNode($attribute);
            }
        }

        if (strtolower($element->tagName) !== 'a') {
            return;
        }

        $href = trim($element->getAttribute('href'));

        if (! self::isSafeHref($href)) {
            $element->removeAttribute('href');
            $element->removeAttribute('target');
            $element->removeAttribute('rel');
            return;
        }

        $element->setAttribute('href', $href);
        $element->setAttribute('target', '_blank');
        $element->setAttribute('rel', 'noopener noreferrer nofollow');
    }

    private static function unwrapNode(DOMElement $element): void
    {
        $parent = $element->parentNode;

        if (! $parent) {
            return;
        }

        while ($element->firstChild) {
            $parent->insertBefore($element->firstChild, $element);
        }

        $parent->removeChild($element);
    }

    private static function isSafeHref(string $href): bool
    {
        if ($href === '') {
            return false;
        }

        return (bool) preg_match('/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i', $href);
    }

    private static function allowedTagString(): string
    {
        return '<' . implode('><', array_keys(self::ALLOWED_TAGS)) . '>';
    }
}
