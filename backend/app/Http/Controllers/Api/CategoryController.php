<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function index(Request $request)
    {
        $categories = Category::query()
            ->withCount('budgets')
            ->orderBy('name')
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => $categories,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255', 'unique:categories,name'],
            'icon' => ['sometimes', 'string', 'max:24'],
            'color' => ['sometimes', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'description' => ['nullable', 'string', 'max:500'],
            'type' => ['required', 'in:income,expense'],
            'requires_approval' => ['sometimes', 'boolean'],
        ]);

        $category = Category::create($validated + [
            'user_id' => $request->user()->id,
            'icon' => 'tag',
            'color' => '#4f46e5',
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Kategori berhasil ditambahkan',
            'data' => $category,
        ], 201);
    }

    public function show(Request $request, Category $category)
    {
        return response()->json([
            'status' => 'success',
            'data' => $category,
        ]);
    }

    public function update(Request $request, Category $category)
    {
        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('categories', 'name')->ignore($category->id),
            ],
            'icon' => ['sometimes', 'string', 'max:24'],
            'color' => ['sometimes', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'type' => ['sometimes', 'required', 'in:income,expense'],
            'requires_approval' => ['sometimes', 'boolean'],
        ]);

        $category->update($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Kategori berhasil diperbarui',
            'data' => $category,
        ]);
    }

    public function destroy(Request $request, Category $category)
    {
        if ($category->budgets()->exists() || Transaction::query()->where('category_id', $category->id)->exists()) {
            return response()->json([
                'message' => 'Kategori masih digunakan oleh transaksi atau anggaran.',
            ], 409);
        }

        $category->delete();

        return response()->json([
            'status' => 'success',
            'message' => 'Kategori berhasil dihapus',
        ]);
    }
}
