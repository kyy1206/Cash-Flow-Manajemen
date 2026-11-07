<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\LazilyRefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReceiptExtractionControllerTest extends TestCase
{
    use LazilyRefreshDatabase;

    public function test_receipt_is_sent_to_the_configured_ocr_service_for_review(): void
    {
        config()->set('services.receipt_ocr.api_key', 'test-ocr-space-api-key');
        Http::fake([
            'api.ocr.space/*' => Http::response([
                'ParsedResults' => [[
                    'ParsedText' => "KEDAI KOPI\nJl. Merdeka 12\n17/10/2026 10:30\nKopi susu Rp 28.000\nTOTAL Rp 28.000\nQRIS",
                ]],
                'IsErroredOnProcessing' => false,
            ]),
        ]);
        Sanctum::actingAs(User::factory()->create(['role' => 'staff']));

        $this->postJson('/api/receipt-extractions', [
            'receipt' => UploadedFile::fake()->image('struk.jpg'),
        ])->assertOk()
            ->assertJsonPath('data.merchant', 'KEDAI KOPI')
            ->assertJsonPath('data.amount', 28000)
            ->assertJsonPath('data.date', '2026-10-17')
            ->assertJsonPath('data.payment_method', 'QRIS')
            ->assertJsonPath('data.description', fn (string $text): bool => str_contains($text, 'Kopi susu'));

        Http::assertSent(fn ($request): bool => $request->url() === 'https://api.ocr.space/parse/image');
        Http::assertSent(fn ($request): bool => $request->hasHeader('apikey', 'test-ocr-space-api-key'));
        Http::assertSent(fn ($request): bool => $request->isMultipart());
        Http::assertSent(fn ($request): bool => $request->hasFile('file', null, 'struk.jpg'));
        Http::assertSent(fn ($request): bool => str_contains($request->body(), 'auto'));
        Http::assertSent(fn ($request): bool => str_contains($request->body(), "name=\"isOverlayRequired\"\r\n\r\nfalse"));
        Http::assertSent(fn ($request): bool => str_contains($request->body(), "name=\"scale\"\r\n\r\ntrue"));
    }

    public function test_ocr_returns_a_clear_error_when_the_service_is_not_configured(): void
    {
        config()->set('services.receipt_ocr.api_key', null);
        Sanctum::actingAs(User::factory()->create(['role' => 'staff']));

        $this->postJson('/api/receipt-extractions', [
            'receipt' => UploadedFile::fake()->image('struk.jpg'),
        ])->assertStatus(503)
            ->assertJsonPath('message', 'OCR belum dikonfigurasi. Atur RECEIPT_OCR_API_KEY di environment backend atau gunakan input manual.');
    }

    public function test_amount_is_extracted_when_ocr_places_the_summary_value_on_a_separate_line(): void
    {
        config()->set('services.receipt_ocr.api_key', 'test-ocr-space-api-key');
        Http::fake([
            'api.ocr.space/*' => Http::response([
                'ParsedResults' => [[
                    'ParsedText' => "TOKO CONTOH\nBarang\nSubtotal\nBayar\nKembali\nRp.\nRp.\nRp.\n1.200.000\n1.200.000\n0",
                ]],
                'IsErroredOnProcessing' => false,
            ]),
        ]);
        Sanctum::actingAs(User::factory()->create(['role' => 'staff']));

        $this->postJson('/api/receipt-extractions', [
            'receipt' => UploadedFile::fake()->image('struk.jpg'),
        ])->assertOk()
            ->assertJsonPath('data.merchant', 'TOKO CONTOH')
            ->assertJsonPath('data.amount', 1200000);
    }

    public function test_receipt_upload_requires_authentication_and_supported_file_type(): void
    {
        $this->postJson('/api/receipt-extractions', [])->assertUnauthorized();

        Sanctum::actingAs(User::factory()->create(['role' => 'staff']));
        $this->postJson('/api/receipt-extractions', [
            'receipt' => UploadedFile::fake()->create('receipt.txt', 5, 'text/plain'),
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('receipt');
    }

    public function test_invalid_ocr_payload_is_not_reported_as_success(): void
    {
        config()->set('services.receipt_ocr.api_key', 'test-ocr-space-api-key');
        Http::fake([
            'api.ocr.space/*' => Http::response([
                'IsErroredOnProcessing' => true,
                'ErrorMessage' => ['invalid image'],
            ]),
        ]);
        Sanctum::actingAs(User::factory()->create(['role' => 'staff']));

        $this->postJson('/api/receipt-extractions', [
            'receipt' => UploadedFile::fake()->image('struk.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'OCR.Space tidak dapat membaca struk ini. Gunakan gambar yang lebih jelas atau input manual.');
    }

    public function test_empty_ocr_text_returns_a_helpful_error_instead_of_empty_success(): void
    {
        config()->set('services.receipt_ocr.api_key', 'test-ocr-space-api-key');
        Http::fake([
            'api.ocr.space/*' => Http::response([
                'IsErroredOnProcessing' => false,
                'ParsedResults' => [['ParsedText' => '']],
            ]),
        ]);
        Sanctum::actingAs(User::factory()->create(['role' => 'staff']));

        $this->postJson('/api/receipt-extractions', [
            'receipt' => UploadedFile::fake()->image('struk.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Teks struk tidak terbaca. Coba foto yang lebih terang, fokus, dan tidak terpotong.');
    }

    public function test_receipt_extraction_is_for_staff_only(): void
    {
        foreach (['owner', 'supervisor'] as $role) {
            Sanctum::actingAs(User::factory()->create(['role' => $role]));
            $this->postJson('/api/receipt-extractions', [
                'receipt' => UploadedFile::fake()->image('struk.jpg'),
            ])->assertForbidden();
        }
    }
}
