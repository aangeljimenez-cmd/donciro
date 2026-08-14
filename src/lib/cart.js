// src/lib/cart.js
const KEY = 'carrito';

// Devuelve el carrito completo: [{ id, cantidad }, ...]
export function getCart() {
  return JSON.parse(localStorage.getItem(KEY) || '[]');
}

// Guarda el carrito completo
function saveCart(cart) {
  localStorage.setItem(KEY, JSON.stringify(cart));
}

// Agrega un producto (o suma cantidad si ya está)
export function addToCart(id, cantidad = 1) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (item) {
    item.cantidad += cantidad;
  } else {
    cart.push({ id, cantidad });
  }
  saveCart(cart);
  return cart;
}

// Quita un producto completo del carrito
export function removeFromCart(id) {
  const cart = getCart().filter((i) => i.id !== id);
  saveCart(cart);
  return cart;
}

// Cambia la cantidad de un producto ya agregado
export function updateQuantity(id, cantidad) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (item) {
    if (cantidad <= 0) {
      return removeFromCart(id);
    }
    item.cantidad = cantidad;
    saveCart(cart);
  }
  return cart;
}

// Cuenta total de productos (para mostrar en un ícono de carrito, por ejemplo)
export function getCartCount() {
  return getCart().reduce((sum, i) => sum + i.cantidad, 0);
}

// Vacía el carrito completo (por ejemplo, después de un checkout exitoso)
export function clearCart() {
  localStorage.removeItem(KEY);
}