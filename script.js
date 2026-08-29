const apiUrl = 'https://yk6ghkfer4.execute-api.us-west-1.amazonaws.com/prod';

function generateProductId() {
    return Math.floor(Math.random() * 1000);
}

async function fetchProducts() {
    try {
        const response = await fetch(`${apiUrl}/products`);
        if (!response.ok) {
            throw new Error('Failed to fetch products');
        }
        const data = await response.json();
        displayProducts(data.products);
    } catch (error) {
        console.error('Error fetching products:', error);
    }
}

function displayProducts(products) {
    const productList = document.getElementById('productList');
    productList.innerHTML = '';
    products.forEach(product => {
        const productElement = document.createElement('div');
        productElement.className = 'product';

        // Support both the new `images` array and old single-`image` records
        // so anything saved before this update still renders.
        const images = product.images && product.images.length
            ? product.images
            : (product.image ? [{ url: product.image }] : []);

        const imagesHtml = images
            .map(img => `<img src="${img.url}" alt="${product.name}" data-product-id="${product.productId}" data-image-url="${img.url}">`)
            .join('');

        productElement.innerHTML = `
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <p>$${product.price}</p>
            <div class="product-images">${imagesHtml}</div>
            <div class="product-actions">
                <button onclick="confirmDeleteProduct('${product.productId}', '${escapeForAttribute(product.name)}')">Remove Plant</button>
                <button onclick="updateProductPrompt('${product.productId}', '${escapeForAttribute(product.price)}')">Update Price</button>
                <button onclick="updateDescriptionPrompt('${product.productId}', '${escapeForAttribute(product.description)}')">Update Description</button>
                <label class="add-photo-label">
                    Add Growth Photo
                    <input type="file" accept="image/*" style="display:none" onchange="addGrowthPhoto('${product.productId}', this)">
                </label>
            </div>
        `;
        productList.appendChild(productElement);
    });

    attachImageLongPressHandlers();
}

// Escapes text going into an inline onclick="...('...')" attribute so names,
// descriptions, or prices containing quotes/apostrophes don't break the HTML.
function escapeForAttribute(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&#39;')
        .replace(/"/g, '&quot;');
}

// Generic yes/no modal. Resolves true if the user confirms, false if they cancel.
function showConfirmModal(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const messageEl = document.getElementById('confirmModalMessage');
        const cancelBtn = document.getElementById('confirmModalCancel');
        const confirmBtn = document.getElementById('confirmModalConfirm');

        messageEl.textContent = message;
        modal.classList.remove('hidden');

        function cleanup(result) {
            modal.classList.add('hidden');
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
            resolve(result);
        }
        function onCancel() { cleanup(false); }
        function onConfirm() { cleanup(true); }

        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
    });
}

async function confirmDeleteProduct(productId, name) {
    const confirmed = await showConfirmModal(`Remove ${name} and all its growth photos? This can't be undone.`);
    if (confirmed) {
        deleteProduct(productId);
    }
}

// Press-and-hold (mouse or touch) on a growth photo to delete just that photo.
function attachImageLongPressHandlers() {
    const HOLD_DURATION_MS = 600;

    document.querySelectorAll('.product-images img').forEach(img => {
        let pressTimer = null;

        const start = () => {
            img.classList.add('pressing');
            pressTimer = setTimeout(() => {
                img.classList.remove('pressing');
                handleImageLongPress(img.dataset.productId, img.dataset.imageUrl);
            }, HOLD_DURATION_MS);
        };

        const cancel = () => {
            clearTimeout(pressTimer);
            img.classList.remove('pressing');
        };

        img.addEventListener('mousedown', start);
        img.addEventListener('mouseup', cancel);
        img.addEventListener('mouseleave', cancel);
        img.addEventListener('touchstart', start, { passive: true });
        img.addEventListener('touchend', cancel);
        img.addEventListener('touchmove', cancel);
        // Prevent the mobile "save image" context menu from popping up mid-hold.
        img.addEventListener('contextmenu', (e) => e.preventDefault());
    });
}

async function handleImageLongPress(productId, imageUrl) {
    const confirmed = await showConfirmModal('Delete this growth photo? This can\'t be undone.');
    if (!confirmed) {
        return;
    }
    try {
        const response = await fetch(`${apiUrl}/product/Image`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ productId, imageUrl })
        });
        if (!response.ok) {
            throw new Error('Failed to delete growth photo');
        }
        console.log('Growth photo deleted');
        fetchProducts();
    } catch (error) {
        console.error('Error deleting growth photo:', error);
    }
}

document.getElementById('productForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = document.getElementById('productName').value;
    const price = document.getElementById('productPrice').value;
    const description = document.getElementById('productDescription').value;
    const imageFile = document.getElementById('productImage').files[0];
    const fileType = imageFile.type.split('/')[1];

    const productId = generateProductId();

    try {
        const response = await fetch(`${apiUrl}/product`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ productId: productId.toString(), name: name, price: Number(price), description: description, imageType: fileType })
        });

        if (!response.ok) {
            throw new Error('Failed to add product');
        }

        const result = await response.json();
        const uploadURL = result.uploadURL;

        await fetch(uploadURL, {
            method: 'PUT',
            headers: {
                'Content-Type': imageFile.type,
            },
            body: imageFile
        });

        console.log('Image uploaded successfully');
        fetchProducts();
        document.getElementById('productForm').reset();
    } catch (error) {
        console.error('Error adding product:', error);
    }
});

// Uploads an additional photo to an existing plant's growth gallery.
async function addGrowthPhoto(productId, fileInput) {
    const file = fileInput.files[0];
    if (!file) {
        return;
    }
    const fileType = file.type.split('/')[1];

    try {
        const response = await fetch(`${apiUrl}/product/Image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ productId, imageType: fileType })
        });

        if (!response.ok) {
            throw new Error('Failed to get upload URL for growth photo');
        }

        const result = await response.json();
        const uploadURL = result.uploadURL;

        await fetch(uploadURL, {
            method: 'PUT',
            headers: {
                'Content-Type': file.type,
            },
            body: file
        });

        console.log('Growth photo uploaded successfully');
        fetchProducts();
    } catch (error) {
        console.error('Error adding growth photo:', error);
    }
}

function updateProductPrompt(id, price) {
    const newPrice = prompt("Enter new price:", price);

    if (newPrice) {
        updateProductField(id, 'price', newPrice);
    }
}

function updateDescriptionPrompt(id, description) {
    const newDescription = prompt("Enter new description:", description);

    if (newDescription !== null && newDescription.trim() !== '') {
        updateProductField(id, 'description', newDescription);
    }
}

async function updateProductField(productId, updateKey, updateValue) {
    try {
        const response = await fetch(`${apiUrl}/product`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ productId, updateKey, updateValue })
        });
        if (!response.ok) {
            throw new Error('Failed to update product');
        }
        const result = await response.json();
        console.log('Product updated:', result);
        fetchProducts();
    } catch (error) {
        console.error('Error updating product:', error);
    }
}

async function deleteProduct(productId) {
    try {
        const response = await fetch(`${apiUrl}/product`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ productId })
        });
        if (!response.ok) {
            throw new Error('Failed to delete product');
        }
        const result = await response.json();
        console.log('Product deleted:', result);
        fetchProducts();
    } catch (error) {
        console.error('Error deleting product:', error);
    }
}

fetchProducts();