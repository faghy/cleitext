<?php
/**
 * Cleitext — WooCommerce export for "WooCommerce Import" (Cleishop add-on).
 *
 * Writes a JSON file with the shop's customers and orders, read through
 * WooCommerce's own functions: it works with the classic tables and with
 * HPOS alike. Nothing is changed on the WordPress site.
 *
 * Run it with WP-CLI from the WordPress folder:
 *   wp eval-file cleitext-woo-export.php > woocommerce-export.json
 * Optional environment: CLEITEXT_EXPORT_SINCE=2020-01-01 (orders from that day).
 *
 * The file holds personal data (names, addresses, emails): keep it private
 * and delete it after the import.
 *
 * License: GPL-2.0-or-later. © Serafino Christian.
 */

if (!defined('ABSPATH') || !function_exists('wc_get_orders')) {
    fwrite(STDERR, "Run it with WP-CLI on a site with WooCommerce: wp eval-file cleitext-woo-export.php\n");
    exit(1);
}

$address = function ($get, $type) {
    $keys = ['first_name', 'last_name', 'company', 'address_1', 'address_2', 'city', 'postcode', 'state', 'country', 'phone', 'email'];
    $out = [];
    foreach ($keys as $key) {
        $out[$key] = (string) $get($type . '_' . $key);
    }
    return $out;
};

// Orders, with what a shop moving keeps: lines, taxes, coupons, notes, refunds.
$since = getenv('CLEITEXT_EXPORT_SINCE') ?: '';
$query = ['limit' => -1, 'type' => 'shop_order', 'status' => array_keys(wc_get_order_statuses()), 'orderby' => 'date', 'order' => 'ASC', 'return' => 'ids'];
if ($since !== '') {
    $query['date_created'] = '>=' . $since;
}
$orders = [];
$orderCount = [];
$paidCount = [];
$failedCount = [];
foreach (wc_get_orders($query) as $id) {
    $order = wc_get_order($id);
    if (!$order) {
        continue;
    }
    $items = [];
    foreach ($order->get_items(['line_item', 'shipping', 'fee']) as $item) {
        $type = $item->get_type();
        $row = [
            'type' => $type,
            'name' => $item->get_name(),
            'quantity' => $type === 'line_item' ? (int) $item->get_quantity() : 1,
            'total' => wc_format_decimal($item->get_total(), 2),
            'tax' => wc_format_decimal($item->get_total_tax(), 2),
        ];
        if ($type === 'line_item') {
            $product = $item->get_product();
            $row['productId'] = (int) $item->get_product_id();
            $row['variationId'] = (int) $item->get_variation_id();
            $row['sku'] = $product ? (string) $product->get_sku() : '';
            // The product's slug, to find it when it has no SKU.
            $parent = wc_get_product((int) $item->get_product_id());
            $row['productSlug'] = $parent ? (string) $parent->get_slug() : '';
            $row['subtotal'] = wc_format_decimal($item->get_subtotal(), 2);
            $row['subtotalTax'] = wc_format_decimal($item->get_subtotal_tax(), 2);
            $attributes = [];
            foreach ($item->get_formatted_meta_data('_', true) as $meta) {
                $attributes[] = ['name' => wp_strip_all_tags($meta->display_key), 'value' => wp_strip_all_tags($meta->display_value)];
            }
            $row['attributes'] = $attributes;
        } elseif ($type === 'shipping') {
            $row['method'] = (string) $item->get_method_id();
        }
        $items[] = $row;
    }
    $taxes = [];
    foreach ($order->get_items('tax') as $tax) {
        $taxes[] = [
            'label' => $tax->get_label(),
            'rate' => (float) $tax->get_rate_percent(),
            'amount' => wc_format_decimal((float) $tax->get_tax_total() + (float) $tax->get_shipping_tax_total(), 2),
        ];
    }
    $coupons = [];
    foreach ($order->get_items('coupon') as $coupon) {
        $coupons[] = ['code' => $coupon->get_code(), 'discount' => wc_format_decimal($coupon->get_discount(), 2)];
    }
    $notes = [];
    foreach (wc_get_order_notes(['order_id' => $id, 'order' => 'ASC']) as $note) {
        $notes[] = [
            'content' => wp_strip_all_tags($note->content),
            'customer' => (bool) $note->customer_note,
            'author' => (string) $note->added_by,
            'date' => $note->date_created ? $note->date_created->format(DATE_ATOM) : null,
        ];
    }
    $refunds = [];
    foreach ($order->get_refunds() as $refund) {
        $refunds[] = [
            'amount' => wc_format_decimal($refund->get_amount(), 2),
            'reason' => (string) $refund->get_reason(),
            'date' => $refund->get_date_created() ? $refund->get_date_created()->format(DATE_ATOM) : null,
        ];
    }
    // Data kept as they were: the number customers know, payment ids, tax and invoice data.
    $meta = [];
    foreach ($order->get_meta_data() as $entry) {
        $key = $entry->key;
        if (preg_match('/^(_order_number|_ppcp_|_wc_avatax_|_wcpdf_|wpml_language|_paypal_|_transaction_id)/', $key)) {
            $meta[$key] = $entry->value;
        }
    }
    $customer = (int) $order->get_customer_id();
    $status = $order->get_status();
    if ($customer && $status === 'failed') {
        $failedCount[$customer] = ($failedCount[$customer] ?? 0) + 1;
    }
    if ($customer) {
        $orderCount[$customer] = ($orderCount[$customer] ?? 0) + 1;
        if ($order->is_paid()) {
            $paidCount[$customer] = ($paidCount[$customer] ?? 0) + 1;
        }
    }
    $date = function ($value) {
        return $value ? $value->format(DATE_ATOM) : null;
    };
    $orders[] = [
        'id' => $id,
        'number' => (string) $order->get_order_number(),
        'status' => $status,
        'currency' => $order->get_currency(),
        'pricesIncludeTax' => (bool) $order->get_prices_include_tax(),
        'createdAt' => $date($order->get_date_created()),
        'paidAt' => $date($order->get_date_paid()),
        'completedAt' => $date($order->get_date_completed()),
        'customerId' => $customer,
        'email' => $order->get_billing_email(),
        'billing' => $address(function ($k) use ($order) { $m = 'get_' . $k; return method_exists($order, $m) ? $order->$m() : ''; }, 'billing'),
        'shipping' => $address(function ($k) use ($order) { $m = 'get_' . $k; return method_exists($order, $m) ? $order->$m() : ''; }, 'shipping'),
        'paymentMethod' => $order->get_payment_method(),
        'paymentTitle' => $order->get_payment_method_title(),
        'transactionId' => $order->get_transaction_id(),
        'customerNote' => $order->get_customer_note(),
        'language' => (string) $order->get_meta('wpml_language'),
        'totals' => [
            'subtotal' => wc_format_decimal($order->get_subtotal(), 2),
            'discount' => wc_format_decimal($order->get_discount_total(), 2),
            'shipping' => wc_format_decimal($order->get_shipping_total(), 2),
            'shippingTax' => wc_format_decimal($order->get_shipping_tax(), 2),
            'tax' => wc_format_decimal($order->get_total_tax(), 2),
            'total' => wc_format_decimal($order->get_total(), 2),
        ],
        'items' => $items,
        'taxes' => $taxes,
        'coupons' => $coupons,
        'notes' => $notes,
        'refunds' => $refunds,
        'meta' => $meta,
    ];
}

// Customers: every user with a billing or shipping address, or an order.
$customers = [];
$ids = get_users(['fields' => 'ID', 'number' => -1]);
foreach ($ids as $userId) {
    $user = get_userdata($userId);
    if (!$user) {
        continue;
    }
    $get = function ($key) use ($userId) {
        return (string) get_user_meta($userId, $key, true);
    };
    $billing = $address($get, 'billing');
    $shipping = $address($get, 'shipping');
    $hasAddress = implode('', $billing) !== '' || implode('', $shipping) !== '';
    if (!$hasAddress && empty($orderCount[$userId]) && !in_array('customer', (array) $user->roles, true)) {
        continue;
    }
    $customers[] = [
        'id' => (int) $userId,
        'email' => $user->user_email,
        'username' => $user->user_login,
        'displayName' => $user->display_name,
        'firstName' => $get('first_name'),
        'lastName' => $get('last_name'),
        'roles' => array_values((array) $user->roles),
        'locale' => get_user_locale($userId),
        'registered' => $user->user_registered,
        'emailVerified' => $get('customer_email_verified') === 'true' || $get('customer_email_verified') === '1',
        'payingCustomer' => $get('paying_customer') === '1',
        'orders' => $orderCount[$userId] ?? 0,
        'paidOrders' => $paidCount[$userId] ?? 0,
        'failedOrders' => $failedCount[$userId] ?? 0,
        'newsletter' => $get('mailchimp_woocommerce_is_subscribed') === '1',
        'billing' => $billing,
        'shipping' => $shipping,
    ];
}

// YITH WooCommerce Wishlist lists, for the Wishlist add-on (when the plugin's tables are there).
global $wpdb;
$wishlists = [];
$listsTable = $wpdb->prefix . 'yith_wcwl_lists';
$itemsTable = $wpdb->prefix . 'yith_wcwl';
if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $listsTable)) === $listsTable) {
    foreach ($wpdb->get_results("SELECT ID, user_id, wishlist_token FROM {$listsTable}") as $list) {
        $saved = [];
        foreach ($wpdb->get_results($wpdb->prepare("SELECT prod_id, dateadded FROM {$itemsTable} WHERE wishlist_id = %d", $list->ID)) as $row) {
            $product = wc_get_product((int) $row->prod_id);
            $saved[] = ['productId' => (int) $row->prod_id, 'sku' => $product ? (string) $product->get_sku() : '', 'productSlug' => $product ? (string) $product->get_slug() : '', 'dateAdded' => $row->dateadded];
        }
        if ($saved) {
            $wishlists[] = ['userId' => (int) $list->user_id, 'token' => (string) $list->wishlist_token, 'items' => $saved];
        }
    }
}

echo wp_json_encode([
    'format' => 'cleitext-woo-export',
    'version' => 1,
    'site' => home_url('/'),
    'currency' => get_woocommerce_currency(),
    'generatedAt' => gmdate(DATE_ATOM),
    'customers' => $customers,
    'orders' => $orders,
    'wishlists' => $wishlists,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), "\n";
