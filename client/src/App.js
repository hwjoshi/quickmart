import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
const socket = io(BACKEND_URL);

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function App() {
  const [view, setView] = useState('customer');
  const [location, setLocation] = useState({ lat: 28.4089, lng: 77.3178 });
  const [products] = useState([
    { id: 1, name: 'Apple', price: 1.5 },
    { id: 2, name: 'Banana', price: 0.8 },
    { id: 3, name: 'Milk', price: 2.0 },
  ]);
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: 'Harsh Wardhan Joshi', phone: '09643840339', address: 'B/2113, SGM Nagar, NH-4, NIT, Faridabad' });
  const [orderId, setOrderId] = useState(null);
  const [driverOrderId, setDriverOrderId] = useState('');
  const [driverLocation, setDriverLocation] = useState({ lat: 28.4089, lng: 77.3178 });
  const [trackingLocation, setTrackingLocation] = useState(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (orderId) {
      socket.on('driver:location', (loc) => {
        console.log('Received driver location for order', orderId, loc);
        if (loc.orderId === orderId) {
          setTrackingLocation({ lat: loc.lat, lng: loc.lng });
        }
      });
      return () => socket.off('driver:location');
    }
  }, [orderId]);

  useEffect(() => {
    if (trackingLocation && mapRef.current && !markerRef.current) {
      markerRef.current = L.marker([trackingLocation.lat, trackingLocation.lng])
        .addTo(mapRef.current)
        .bindPopup('Driver')
        .openPopup();
    } else if (markerRef.current && trackingLocation) {
      markerRef.current.setLatLng([trackingLocation.lat, trackingLocation.lng]);
      mapRef.current.setView([trackingLocation.lat, trackingLocation.lng], 14);
    }
  }, [trackingLocation]);

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      });
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };
  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));
  const updateQuantity = (id, delta) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        if (newQty <= 0) return null;
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(Boolean));
  };
  const totalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const placeOrder = async () => {
    if (!customer.name || !customer.phone || !customer.address) {
      alert('Please fill customer details');
      return;
    }
    if (cart.length === 0) {
      alert('Cart is empty');
      return;
    }
    const payload = {
      customer_name: customer.name,
      customer_phone: customer.phone,
      delivery_address: customer.address,
      lat: location.lat,
      lng: location.lng,
      items: cart.map(item => ({ product_id: item.id, quantity: item.quantity }))
    };
    try {
      const res = await fetch(`${BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert(`Order placed! Order ID: ${data.order_id}`);
        setOrderId(data.order_id);
        setCart([]);
        socket.emit('driver:join', data.order_id);
      } else {
        alert('Order failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const joinOrderAsDriver = () => {
    if (!driverOrderId) return;
    socket.emit('driver:join', driverOrderId);
    alert(`Joined order ${driverOrderId}. You can now send location updates.`);
  };

  const sendDriverLocation = () => {
    if (!driverOrderId) return;
        console.log('Received driver location for order', orderId, loc);
    socket.emit('driver:location', { orderId: driverOrderId, lat: driverLocation.lat, lng: driverLocation.lng });
    alert('Location sent');
  };

  useEffect(() => {
    if (orderId && !mapRef.current) {
      const mapDiv = document.getElementById('tracking-map');
      if (mapDiv) {
        mapRef.current = L.map(mapDiv).setView([location.lat, location.lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        }).addTo(mapRef.current);
      }
    }
  }, [orderId, location]);

  return (
    <div style={{ padding: '20px' }}>
      <div>
        <button onClick={() => setView('customer')}>Customer View</button>
        <button onClick={() => setView('driver')}>Driver View</button>
      </div>
      <hr />
      {view === 'customer' && (
        <div>
          <h2>Hyperlocal Grocery Delivery</h2>
          <button onClick={getLocation}>Get Current Location</button>
          <p>Your location: {location.lat.toFixed(4)}, {location.lng.toFixed(4)}</p>
          <h3>Products</h3>
          {products.map(p => (
            <div key={p.id}>{p.name} - ${p.price} <button onClick={() => addToCart(p)}>Add</button></div>
          ))}
          <h3>Cart</h3>
          {cart.map(item => (
            <div key={item.id}>
              {item.name} x {item.quantity} = ${(item.price * item.quantity).toFixed(2)}
              <button onClick={() => updateQuantity(item.id, -1)}>-</button>
              <button onClick={() => updateQuantity(item.id, 1)}>+</button>
              <button onClick={() => removeFromCart(item.id)}>Remove</button>
            </div>
          ))}
          <p><strong>Total: ${totalAmount.toFixed(2)}</strong></p>
          <h3>Customer Details</h3>
          <input type="text" placeholder="Name" value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})} /><br/>
          <input type="text" placeholder="Phone" value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})} /><br/>
          <textarea placeholder="Address" value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})} /><br/>
          <button onClick={placeOrder}>Place Order</button>
          {orderId && (
            <div style={{ marginTop: '20px' }}>
              <h4>Order #{orderId} - Tracking Driver</h4>
              <div id="tracking-map" style={{ height: '400px', width: '100%' }}></div>
              {!trackingLocation && <p>Waiting for driver to send location...</p>}
            </div>
          )}
        </div>
      )}
      {view === 'driver' && (
        <div>
          <h2>Driver Panel</h2>
          <input type="text" placeholder="Order ID" value={driverOrderId} onChange={e => setDriverOrderId(e.target.value)} />
          <button onClick={joinOrderAsDriver}>Join Order</button>
          <hr />
          <h3>Send Location Update</h3>
          <label>Lat: <input type="number" step="any" value={driverLocation.lat} onChange={e => setDriverLocation({...driverLocation, lat: parseFloat(e.target.value)})} /></label>
          <label>Lng: <input type="number" step="any" value={driverLocation.lng} onChange={e => setDriverLocation({...driverLocation, lng: parseFloat(e.target.value)})} /></label>
          <button onClick={sendDriverLocation}>Update Location</button>
        </div>
      )}
    </div>
  );
}

export default App;